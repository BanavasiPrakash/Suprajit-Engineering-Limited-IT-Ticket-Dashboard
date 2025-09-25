const express = require('express');
const axios = require('axios');
const cors = require('cors');
const Bottleneck = require('bottleneck');
const axiosRetry = require('axios-retry').default;

const app = express();
const port = 5000;

app.use(cors());

axios.interceptors.request.use(request => {
  console.log('Starting Request', request.method, request.url, request.params);
  return request;
});

const clientId = "1000.VEPAX9T8TKDWJZZD95XT6NN52PRPQY";
const clientSecret = "acca291b89430180ced19660cd28ad8ce1e4bec6e8";
const refreshToken = "1000.465100d543b8d9471507bdf0b0263414.608f3f3817d11b09f142fd29810cca6f";

let cachedAccessToken = null;
let accessTokenExpiry = null;

const limiter = new Bottleneck({ minTime: 1100 });

axiosRetry(axios, {
  retries: 4,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: error =>
    error.response && (error.response.status === 429 || error.response.status >= 500),
});

async function getAccessToken() {
  try {
    const now = Date.now();
    if (cachedAccessToken && accessTokenExpiry && now < accessTokenExpiry) {
      console.log('Using cached access token');
      return cachedAccessToken;
    }
    const params = new URLSearchParams();
    params.append('refresh_token', refreshToken);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'refresh_token');

    const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    console.log('Access token fetched:', response.data);

    cachedAccessToken = response.data.access_token;
    accessTokenExpiry = now + (response.data.expires_in - 60) * 1000;

    return cachedAccessToken;
  } catch (error) {
    console.error('Failed to get access token:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchAllTickets(accessToken, departmentId = null, agentId = null) {
  let from = 1;
  const limit = 100;
  let allItems = [];

  try {
    while (true) {
      const params = { from, limit };
      if (departmentId) params.departmentId = departmentId;
      if (agentId) params.agentId = agentId;

      const response = await axios.get('https://desk.zoho.com/api/v1/tickets', {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        params,
      });
      console.log(`Fetched tickets from ${from}, count: ${response.data.data.length}`);

      allItems = allItems.concat(response.data.data);

      if (response.data.data.length < limit) break;
      from += limit;
    }
  } catch (error) {
    console.error('Error fetching tickets:', error.response?.data || error.message);
    throw error;
  }

  return allItems;
}

async function fetchAllContacts(accessToken) {
  let from = 1;
  const limit = 100;
  let allContacts = [];

  try {
    while (true) {
      const response = await axios.get('https://desk.zoho.com/api/v1/contacts', {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        params: { from, limit },
      });
      console.log(`Fetched contacts from ${from}, count: ${response.data.data.length}`);

      allContacts = allContacts.concat(response.data.data);

      if (response.data.data.length < limit) break;
      from += limit;
    }
  } catch (error) {
    console.error('Error fetching contacts:', error.response?.data || error.message);
    throw error;
  }

  return allContacts;
}

// Map Zoho API ticket statuses to dashboard status keys
const statusMap = {
  'open': 'open',
  'on hold': 'hold',
  'hold': 'hold',
  'closed': 'closed',
  'in progress': 'inProgress',
  'unassigned': 'unassigned',
  '': 'unassigned', // treat empty status as unassigned
  // Add any custom or additional statuses here as needed
};

app.get('/api/zoho-members-with-ticket-counts', async (req, res) => {
  try {
    // Optionally pass departmentId or agentId in query string to match dashboard filters
    const departmentId = req.query.departmentId || null;
    const agentId = req.query.agentId || null;

    const accessToken = await getAccessToken();

    const contacts = await fetchAllContacts(accessToken);
    const tickets = await fetchAllTickets(accessToken, departmentId, agentId);

    console.log(`Total contacts fetched: ${contacts.length}`);
    console.log(`Total tickets fetched: ${tickets.length}`);

    const ticketStatusCountMap = {};
    contacts.forEach(contact => {
      ticketStatusCountMap[contact.id] = {
        open: 0,
        closed: 0,
        hold: 0,
        escalated: 0,
        unassigned: 0,
        inProgress: 0,
      };
    });

    tickets.forEach(ticket => {
      const contactId = ticket.contactId;
      if (!contactId || !ticketStatusCountMap[contactId]) return;

      const rawStatus = (ticket.status || '').toLowerCase();
      const normalizedStatus = statusMap[rawStatus] || 'unassigned';

      // Count status per contact
      switch (normalizedStatus) {
        case 'open':
          ticketStatusCountMap[contactId].open++;
          break;
        case 'hold':
          ticketStatusCountMap[contactId].hold++;
          break;
        case 'closed':
          ticketStatusCountMap[contactId].closed++;
          break;
        case 'inProgress':
          ticketStatusCountMap[contactId].inProgress++;
          break;
        case 'unassigned':
          ticketStatusCountMap[contactId].unassigned++;
          break;
        default:
          ticketStatusCountMap[contactId].unassigned++; // fallback
          break;
      }

      // Escalated logic - count only once if escalated
      const escalated =
        ticket.isEscalated === true || String(ticket.escalated).toLowerCase() === 'true';
      if (escalated) {
        ticketStatusCountMap[contactId].escalated++;
      }
    });

    const members = contacts.map(contact => ({
      id: contact.id,
      name:
        contact.firstName && contact.lastName
          ? `${contact.firstName} ${contact.lastName}`
          : contact.name || contact.email || 'Unknown',
      tickets: ticketStatusCountMap[contact.id],
    }));

    res.json(members);
  } catch (error) {
    console.error('Error fetching members with ticket status counts:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch members with ticket status counts.' });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
