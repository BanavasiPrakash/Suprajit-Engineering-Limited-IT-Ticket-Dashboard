const express = require("express");
const axios = require("axios");
const cors = require("cors");
const Bottleneck = require("bottleneck");
const axiosRetry = require("axios-retry").default;

const app = express();
const port = 5000;

app.use(cors());

const clientId = "1000.VEPAX9T8TKDWJZZD95XT6NN52PRPQY";
const clientSecret = "acca291b89430180ced19660cd28ad8ce1e4bec6e8";
const refreshToken = "1000.465100d543b8d9471507bdf0b0263414.608f3f3817d11b09f142fd29810cca6f";

let cachedAccessToken = null;
let accessTokenExpiry = null;

const limiter = new Bottleneck({ minTime: 1100 });

axiosRetry(axios, {
  retries: 4,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    error.response && (error.response.status === 429 || error.response.status >= 500),
});

async function getAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && accessTokenExpiry && now < accessTokenExpiry) {
    return cachedAccessToken;
  }
  const params = new URLSearchParams();
  params.append("refresh_token", refreshToken);
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("grant_type", "refresh_token");

  const response = await axios.post(
    "https://accounts.zoho.com/oauth/v2/token",
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cachedAccessToken = response.data.access_token;
  accessTokenExpiry = now + (response.data.expires_in - 60) * 1000;
  return cachedAccessToken;
}

async function fetchAllTickets(accessToken, departmentId = null, agentId = null) {
  let from = 1;
  const limit = 100;
  let allTickets = [];

  while (true) {
    const params = { from, limit };
    if (departmentId) params.departmentId = departmentId;
    if (agentId) params.agentId = agentId;

    const response = await limiter.schedule(() =>
      axios.get("https://desk.zoho.com/api/v1/tickets", {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        params,
      })
    );

    allTickets = allTickets.concat(response.data.data || []);
    if (response.data.data.length < limit) break;
    from += limit;
  }

  return allTickets;
}

async function fetchAllUsers(accessToken) {
  let from = 1;
  const limit = 100;
  let allUsers = [];

  while (true) {
    const response = await limiter.schedule(() =>
      axios.get("https://desk.zoho.com/api/v1/users", {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        params: { from, limit },
      })
    );

    allUsers = allUsers.concat(response.data.data || []);
    if (response.data.data.length < limit) break;
    from += limit;
  }

  return allUsers;
}

async function fetchUsersByIds(accessToken, ids) {
  const users = [];
  for (const id of ids) {
    try {
      const response = await limiter.schedule(() =>
        axios.get(`https://desk.zoho.com/api/v1/users/${id}`, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        })
      );
      users.push(response.data);
    } catch (err) {
      console.warn(`Could not fetch user ID ${id}:`, err.message);
    }
  }
  return users;
}

const statusMap = {
  open: "open",
  "on hold": "hold",
  hold: "hold",
  closed: "closed",
  "in progress": "inProgress",
  unassigned: "unassigned",
  "": "unassigned",
};

app.get("/api/zoho-assignees-with-ticket-counts", async (req, res) => {
  try {
    const { departmentId, agentId } = req.query;
    const accessToken = await getAccessToken();

    let users = await fetchAllUsers(accessToken);
    const tickets = await fetchAllTickets(accessToken, departmentId, agentId);

    const allAssigneeIds = new Set(tickets.map((t) => t.assigneeId).filter(Boolean));
    const knownUserIds = new Set(users.map((u) => u.id));

    const missingUserIds = Array.from(allAssigneeIds).filter((id) => !knownUserIds.has(id));
    if (missingUserIds.length > 0) {
      const missingUsers = await fetchUsersByIds(accessToken, missingUserIds);
      users = users.concat(missingUsers);
    }

    const ticketStatusCountMap = {};
    const latestUnassignedTicketIdMap = {};

    users.forEach((user) => {
      ticketStatusCountMap[user.id] = {
        open: 0,
        closed: 0,
        hold: 0,
        escalated: 0,
        unassigned: 0,
        inProgress: 0,
      };
      latestUnassignedTicketIdMap[user.id] = null;
    });

    ticketStatusCountMap["unassigned"] = {
      open: 0,
      closed: 0,
      hold: 0,
      escalated: 0,
      unassigned: 0,
      inProgress: 0,
    };
    latestUnassignedTicketIdMap["unassigned"] = null;

    // Collect all unassigned ticket numbers here
    const allUnassignedTicketNumbers = [];

    tickets.forEach((ticket) => {
      const assigneeRaw =
        ticket.assigneeId === undefined || ticket.assigneeId === null
          ? ""
          : ticket.assigneeId.toString().toLowerCase();

      const isUnassignedAssignee =
        assigneeRaw === "" || assigneeRaw === "none" || assigneeRaw === "null";

      const assigneeId = isUnassignedAssignee ? "unassigned" : ticket.assigneeId;

      if (!ticketStatusCountMap[assigneeId]) {
        ticketStatusCountMap[assigneeId] = {
          open: 0,
          closed: 0,
          hold: 0,
          escalated: 0,
          unassigned: 0,
          inProgress: 0,
        };
        latestUnassignedTicketIdMap[assigneeId] = null;
      }

      // Add all unassigned ticket numbers
      if (isUnassignedAssignee || (ticket.status && ticket.status.toLowerCase() === "unassigned")) {
        const ticketNumber = ticket.ticketNumber || ticket.id;
        if (ticketNumber) {
          allUnassignedTicketNumbers.push(ticketNumber);
        }
        const currentLatest = latestUnassignedTicketIdMap[assigneeId];
        if (
          currentLatest === null ||
          (typeof currentLatest === "number" && ticketNumber > currentLatest) ||
          (typeof currentLatest === "string" && ticketNumber.localeCompare(currentLatest) > 0)
        ) {
          latestUnassignedTicketIdMap[assigneeId] = ticketNumber;
        }
      }

      const rawStatus = (ticket.status || "").toLowerCase();
      const normalizedStatus = statusMap[rawStatus] || "unassigned";

      const isEscalated = ticket.isEscalated === true || String(ticket.escalated).toLowerCase() === "true";

      // Skip closed tickets under unassigned
      if (isUnassignedAssignee && normalizedStatus === "closed") {
        return; // Skip counting closed unassigned tickets
      }

      if (isUnassignedAssignee) {
        ticketStatusCountMap["unassigned"].unassigned++;
      } else if (normalizedStatus === "unassigned" || isEscalated) {
        ticketStatusCountMap[assigneeId].escalated++;
      } else if (normalizedStatus === "open") {
        ticketStatusCountMap[assigneeId].open++;
      } else if (normalizedStatus === "hold") {
        ticketStatusCountMap[assigneeId].hold++;
      } else if (normalizedStatus === "closed") {
        ticketStatusCountMap[assigneeId].closed++;
      } else if (normalizedStatus === "inProgress") {
        ticketStatusCountMap[assigneeId].inProgress++;
      }
    });

    users.push({
      id: "unassigned",
      fullName: "Unassigned",
      displayName: "Unassigned",
    });

    const members = users
      .filter((user) => user.id in ticketStatusCountMap)
      .map((user) => {
        let name = "Unknown";
        if (user.firstName && user.lastName) name = `${user.firstName} ${user.lastName}`;
        else if (user.fullName) name = user.fullName;
        else if (user.displayName) name = user.displayName;
        else if (user.name) name = user.name;
        else if (user.email) name = user.email;

        return {
          id: user.id,
          name,
          tickets: ticketStatusCountMap[user.id],
          latestUnassignedTicketId: latestUnassignedTicketIdMap[user.id] || null,
        };
      });

    res.json({ members, unassignedTicketNumbers: allUnassignedTicketNumbers });
  } catch (error) {
    console.error("API error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch assignee ticket counts" });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
