import React, { useEffect, useState, useMemo } from "react";
import Select, { components } from "react-select";
import { FaSearch } from "react-icons/fa";
import "./TicketDashboard.css";

const ASSIGNEE_COL_ID = 4549002565209988;
const OPEN_STATUS_COL_ID = 1001;
const CLOSED_STATUS_COL_ID = 1002;
const HOLD_STATUS_COL_ID = 1003;
const ESCALATED_STATUS_COL_ID = 1004;
const UNASSIGNED_STATUS_COL_ID = 1005;
const IN_PROGRESS_STATUS_COL_ID = 1006;

const CANDIDATES_PER_PAGE = 24;

const Option = (props) => (
  <components.Option {...props}>
    <input
      type="checkbox"
      checked={props.isSelected}
      readOnly
      style={{ marginRight: 8 }}
      tabIndex={-1}
    />
    {props.label}
  </components.Option>
);

const { ValueContainer, Placeholder } = components;
const CustomValueContainer = ({ children, ...props }) => (
  <ValueContainer {...props}>
    <Placeholder {...props}>{props.selectProps.placeholder}</Placeholder>
    {React.Children.map(children, (child) =>
      child && child.type !== Placeholder ? null : null
    )}
  </ValueContainer>
);

const selectStyles = {
  multiValue: () => ({ display: "none" }),
  multiValueLabel: () => ({ display: "none" }),
  multiValueRemove: () => ({ display: "none" }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

async function fetchZohoDataFromBackend(setRows, setError) {
  try {
    let url = "http://localhost:5000/api/zoho-assignees-with-ticket-counts";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Failed to fetch Zoho assignee ticket counts");
    }

    const data = await response.json();

    const rows = data.map((member) => ({
      cells: [
        { columnId: ASSIGNEE_COL_ID, value: member.name },
        { columnId: OPEN_STATUS_COL_ID, value: member.tickets.open?.toString() || "0" },
        { columnId: CLOSED_STATUS_COL_ID, value: member.tickets.closed?.toString() || "0" },
        { columnId: HOLD_STATUS_COL_ID, value: member.tickets.hold?.toString() || "0" },
        {
          columnId: ESCALATED_STATUS_COL_ID,
          value: member.tickets.escalated?.toString() || "0",
        },
        {
          columnId: UNASSIGNED_STATUS_COL_ID,
          value: member.tickets.unassigned?.toString() || "0",
        },
        {
          columnId: IN_PROGRESS_STATUS_COL_ID,
          value: member.tickets.inProgress?.toString() || "0",
        },
      ],
    }));

    setRows(rows);
    localStorage.setItem("ticketDashboardRows", JSON.stringify(rows));
    setError(null);
  } catch (error) {
    setError(error.message);
  }
}

function TicketDashboard() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState("asc");

  const [openSum, setOpenSum] = useState(0);
  const [closedSum, setClosedSum] = useState(0);
  const [holdSum, setHoldSum] = useState(0);
  const [escalatedSum, setEscalatedSum] = useState(0);
  const [unassignedSum, setUnassignedSum] = useState(0);
  const [inProgressSum, setInProgressSum] = useState(0);

  const [filteredCandidates, setFilteredCandidates] = useState([]);
  const [gridCells, setGridCells] = useState([]);

  useEffect(() => {
    const cachedRows = localStorage.getItem("ticketDashboardRows");
    if (cachedRows) {
      setRows(JSON.parse(cachedRows));
    }
    fetchZohoDataFromBackend(setRows, setError);
  }, []);

  const nonZeroRows = useMemo(() => {
    return rows.filter((row) => {
      const ticketCounts = row.cells
        .filter(c => c.columnId !== ASSIGNEE_COL_ID)
        .map(c => Number(c.value) || 0);
      return ticketCounts.some(count => count > 0);
    });
  }, [rows]);

  const candidateOptions = useMemo(() => {
    const setNames = new Set();
    nonZeroRows.forEach((row) => {
      const name = row.cells.find((c) => c.columnId === ASSIGNEE_COL_ID)?.value?.trim();
      if (name) setNames.add(name);
    });
    return Array.from(setNames)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [nonZeroRows]);

  const statusOptions = [
    { value: "open", label: "Open" },
    { value: "hold", label: "Hold" },
    { value: "inProgress", label: "In Progress" },
    { value: "escalated", label: "Escalated" },
    { value: "unassigned", label: "Unassigned" },
    { value: "closed", label: "Closed" },
  ];

  const selectedStatusKeys = useMemo(() => {
    return selectedStatuses.length > 0
      ? selectedStatuses.map((s) => s.value)
      : statusOptions.map((s) => s.value);
  }, [selectedStatuses]);

  const personFilterOption = (option, inputValue) => {
    if (!inputValue) return true;
    if (selectedCandidates.find(sel => sel.value === option.value)) return true;
    return option.label.toLowerCase().includes(inputValue.toLowerCase());
  };

  useEffect(() => {
    const filteredRows = nonZeroRows.filter((row) => {
      const candidateRaw = row.cells.find((c) => c.columnId === ASSIGNEE_COL_ID)?.value?.trim() || "";
      const candidateLower = candidateRaw.toLowerCase();

      if (searchTerm && !candidateLower.includes(searchTerm.toLowerCase())) return false;
      if (
        selectedCandidates.length > 0 &&
        !selectedCandidates.some((c) => c.value.toLowerCase() === candidateLower)
      )
        return false;

      return true;
    });

    const candidateCountMap = {};
    filteredRows.forEach((row) => {
      const candidate = row.cells.find((c) => c.columnId === ASSIGNEE_COL_ID)?.value?.trim();
      if (!candidate) return;

      const cellsById = row.cells.reduce((acc, cell) => {
        acc[cell.columnId] = Number(cell.value) || 0;
        return acc;
      }, {});

      if (!candidateCountMap[candidate]) {
        candidateCountMap[candidate] = {
          open: 0,
          hold: 0,
          closed: 0,
          escalated: 0,
          unassigned: 0,
          inProgress: 0,
        };
      }

      if (selectedStatusKeys.includes("open")) candidateCountMap[candidate].open += cellsById[OPEN_STATUS_COL_ID];
      if (selectedStatusKeys.includes("hold")) candidateCountMap[candidate].hold += cellsById[HOLD_STATUS_COL_ID];
      if (selectedStatusKeys.includes("inProgress")) candidateCountMap[candidate].inProgress += cellsById[IN_PROGRESS_STATUS_COL_ID];
      if (selectedStatusKeys.includes("escalated")) candidateCountMap[candidate].escalated += cellsById[ESCALATED_STATUS_COL_ID];
      if (selectedStatusKeys.includes("unassigned")) candidateCountMap[candidate].unassigned += cellsById[UNASSIGNED_STATUS_COL_ID];
      if (selectedStatusKeys.includes("closed")) candidateCountMap[candidate].closed += cellsById[CLOSED_STATUS_COL_ID];
    });

    const sums = { open: 0, hold: 0, closed: 0, escalated: 0, unassigned: 0, inProgress: 0 };
    Object.values(candidateCountMap).forEach((c) => {
      sums.open += c.open;
      sums.hold += c.hold;
      sums.closed += c.closed;
      sums.escalated += c.escalated;
      sums.unassigned += c.unassigned;
      sums.inProgress += c.inProgress;
    });

    setOpenSum(sums.open);
    setHoldSum(sums.hold);
    setClosedSum(sums.closed);
    setEscalatedSum(sums.escalated);
    setUnassignedSum(sums.unassigned);
    setInProgressSum(sums.inProgress);

    setFilteredCandidates(Object.entries(candidateCountMap));
    setCurrentPage(1);
  }, [nonZeroRows, searchTerm, selectedCandidates, selectedStatuses, selectedStatusKeys]);

  useEffect(() => {
    const totalPages = Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);

    const sortedFilteredCandidates = [...filteredCandidates].sort((a, b) => {
      if (a[0] < b[0]) return sortOrder === "asc" ? -1 : 1;
      if (a[0] > b[0]) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const start = (currentPage - 1) * CANDIDATES_PER_PAGE;
    const end = Math.min(start + CANDIDATES_PER_PAGE, sortedFilteredCandidates.length);

    const cells = [];
    for (let i = start; i < end; i++) {
      const [candidate, counts] = sortedFilteredCandidates[i];
      cells.push(
        <div key={candidate} className="grid-cell" style={{ animationDelay: `${(i - start) * 65}ms` }}>
          <div className="candidate-name">{candidate}</div>
          <div className="ticket-counts">
            {selectedStatusKeys.includes("open") && <div className="count-box open">{counts.open}</div>}
            {selectedStatusKeys.includes("hold") && <div className="count-box hold">{counts.hold}</div>}
            {selectedStatusKeys.includes("inProgress") && <div className="count-box inprogress">{counts.inProgress}</div>}
            {selectedStatusKeys.includes("escalated") && <div className="count-box escalated">{counts.escalated}</div>}
            {selectedStatusKeys.includes("unassigned") && <div className="count-box unassigned">{counts.unassigned}</div>}
            {selectedStatusKeys.includes("closed") && <div className="count-box closed">{counts.closed}</div>}
          </div>
        </div>
      );
    }
    setGridCells(cells);
  }, [filteredCandidates, currentPage, sortOrder, selectedStatusKeys]);

  useEffect(() => {
    if (filteredCandidates.length <= CANDIDATES_PER_PAGE) return;

    const interval = setInterval(() => {
      setCurrentPage((p) =>
        p >= Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE) ? 1 : p + 1
      );
    }, 10000);

    return () => clearInterval(interval);
  }, [filteredCandidates]);

  return (
    <>
      <div className="dashboard-header-main" style={{ maxWidth: 1300, margin: "0 auto 30px auto" }}>
        <div
          className="dashboard-header-top"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <img
            className="header-image"
            src="/suprajit_logo_BG.png"
            alt="Left icon"
            style={{ height: 80, width: "auto" }}
          />
          <div
            className="dashboard-title-container"
            style={{
              fontWeight: 900,
              fontSize: 44,
              letterSpacing: 2,
              color: "#e0eaff",
              textShadow: "2px 2px 6px rgba(0, 0, 50, 0.7)",
              userSelect: "none",
              textTransform: "uppercase",
            }}
          >
            TICKET DASHBOARD
          </div>
          <img
            className="header-image"
            src="/IT-LOGO.png"
            alt="Right icon"
            style={{ height: 70, width: "auto" }}
          />
        </div>

        <div
          className="dashboard-header-filters"
          style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, marginLeft: -40 }}
        >
          <div className="legend-bar" style={{ display: "flex", gap: 14 }}>
            <div className="legend-item open">
              OPEN <span>{openSum.toString().padStart(3, "0")}</span>
            </div>
            <div className="legend-item hold">
              HOLD <span>{holdSum.toString().padStart(3, "0")}</span>
            </div>
            <div className="legend-item inprogress">
              IN PROGRESS <span>{inProgressSum.toString().padStart(3, "0")}</span>
            </div>
            <div className="legend-item escalated">
              ESCALATED <span>{escalatedSum.toString().padStart(3, "0")}</span>
            </div>
            <div className="legend-item unassigned">
              UNASSIGNED <span>{unassignedSum.toString().padStart(3, "0")}</span>
            </div>
            <div className="legend-item closed">
              CLOSED <span>{closedSum.toString().padStart(3, "0")}</span>
            </div>
          </div>

          <div style={{ minWidth: 210 }}>
            <Select
              closeMenuOnSelect={false}
              hideSelectedOptions={false}
              components={{ Option, ValueContainer: CustomValueContainer }}
              isMulti
              options={candidateOptions}
              value={selectedCandidates}
              onChange={setSelectedCandidates}
              placeholder="Select persons"
              styles={{
                ...selectStyles,
                control: (base) => ({ ...base, minHeight: 40, fontWeight: 700, borderRadius: 10 }),
              }}
              menuPortalTarget={document.body}
              filterOption={(option, input) => {
                if (!input) return true;
                if (selectedCandidates.some(sel => sel.value === option.value)) return true;
                return option.label.toLowerCase().includes(input.toLowerCase());
              }}
              isSearchable={true}
            />
          </div>

          <div style={{ minWidth: 210 }}>
            <Select
              closeMenuOnSelect={false}
              hideSelectedOptions={false}
              components={{ Option, ValueContainer: CustomValueContainer }}
              isMulti
              options={statusOptions}
              value={selectedStatuses}
              onChange={setSelectedStatuses}
              placeholder="Select statuses"
              styles={{
                ...selectStyles,
                control: (base) => ({ ...base, minHeight: 40, fontWeight: 700, borderRadius: 10 }),
              }}
              menuPortalTarget={document.body}
            />
          </div>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            style={{ height: 40, width: 75, borderRadius: 10 }}
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>

          <button
            type="button"
            aria-label="Search candidate"
            style={{
              height: 40,
              width: 40,
              borderRadius: 10,
              background: "#fff",
              border: "1px solid #ccc",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: 8,
            }}
            onClick={() => {
              // Optional: focus some input if you have one or trigger search
            }}
          >
            <FaSearch />
          </button>
        </div>

        <div
          className="grid-container"
          style={{
            marginTop: 40,
            display: "grid",
            gap: "24px",
            gridTemplateColumns: "repeat(6, 1fr)",
            gridTemplateRows: "repeat(4, auto)",
            maxWidth: 1400,
          }}
        >
          {gridCells}
        </div>

        <div className="pagination-container" style={{ marginTop: 20, textAlign: "center" }}>
          <button
            style={{
              backgroundColor: "transparent",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              userSelect: "none",
              padding: "0 8px",
            }}
            onClick={() => setCurrentPage((p) => (p > 1 ? p - 1 : Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE)))}
            aria-label="Previous page"
          >
            {'<'}
          </button>

          {[...Array(Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE)).keys()].map((i) => (
            <span
              key={i}
              onClick={() => setCurrentPage(i + 1)}
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: "50%",
                margin: "0 6px",
                backgroundColor: currentPage === i + 1 ? "#007bff" : "#888",
                cursor: "pointer",
                userSelect: "none",
              }}
              aria-label={`Page ${i + 1}`}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === "Enter") setCurrentPage(i + 1);
              }}
            />
          ))}

          <button
            style={{
              backgroundColor: "transparent",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              userSelect: "none",
              padding: "0 8px",
            }}
            onClick={() => setCurrentPage((p) => (p < Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE) ? p + 1 : 1))}
            aria-label="Next page"
          >
            {'>'}
          </button>
        </div>
      </div>
    </>
  );
}

export default TicketDashboard;
