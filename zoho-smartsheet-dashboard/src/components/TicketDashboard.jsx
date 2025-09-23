import React, { useEffect, useState, useMemo } from "react";
import Select, { components } from "react-select";
import "./TicketDashboard.css";

const TICKET_RAISER_COL_ID = 4549002565209988;
const STATUS_COL_ID = 3317549542100868;
const ESCALATED_COL_ID = 6800802378895236;
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

function TicketDashboard() {
  const [rows, setRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState("asc");

  const [openSum, setOpenSum] = useState(0);
  const [holdSum, setHoldSum] = useState(0);
  const [closedSum, setClosedSum] = useState(0);
  const [escalatedSum, setEscalatedSum] = useState(0);
  const [unassignedSum, setUnassignedSum] = useState(0);

  const [filteredCandidates, setFilteredCandidates] = useState([]);
  const [gridCells, setGridCells] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/api/sheet")
      .then((res) => res.json())
      .then((data) => setRows(data?.rows || []))
      .catch(() => setRows([]));
  }, []);

  const allCandidateNames = useMemo(() => {
    const setNames = new Set();
    rows.forEach((row) => {
      const name = row.cells.find((c) => c.columnId === TICKET_RAISER_COL_ID)?.value?.trim();
      if (name) setNames.add(name);
    });
    return Array.from(setNames);
  }, [rows]);

  const candidateOptions = allCandidateNames.map((name) => ({ value: name, label: name }));

  const statusOptions = [
    { value: "open", label: "Open" },
    { value: "closed", label: "Closed" },
    { value: "hold", label: "Hold" },
    { value: "escalated", label: "Escalated" },
    { value: "unassigned", label: "Unassigned" },
  ];

  const selectedStatusKeys = useMemo(() => {
    return selectedStatuses.length > 0 ? selectedStatuses.map((s) => s.value) : statusOptions.map((s) => s.value);
  }, [selectedStatuses]);

  useEffect(() => {
    // Filter rows by search term and selected candidates only
    const filteredRows = rows.filter((row) => {
      const candidateRaw = row.cells.find((c) => c.columnId === TICKET_RAISER_COL_ID)?.value?.trim() || "";
      const candidateLower = candidateRaw.toLowerCase();

      if (searchTerm && !candidateLower.includes(searchTerm.toLowerCase())) return false;
      if (selectedCandidates.length > 0 && !selectedCandidates.some((c) => c.value.toLowerCase() === candidateLower)) return false;

      // Do not filter by status here
      return true;
    });

    const candidateCountMap = {};
    filteredRows.forEach((row) => {
      const candidate = row.cells.find((c) => c.columnId === TICKET_RAISER_COL_ID)?.value?.trim();
      if (!candidate) return;

      const status = (row.cells.find((c) => c.columnId === STATUS_COL_ID)?.value || "").toLowerCase().trim();
      const escalatedFlag = (row.cells.find((c) => c.columnId === ESCALATED_COL_ID)?.value || "").toLowerCase().trim();

      if (!candidateCountMap[candidate]) {
        candidateCountMap[candidate] = { open: 0, hold: 0, closed: 0, escalated: 0, unassigned: 0 };
      }

      if (status === "open") candidateCountMap[candidate].open++;
      else if (status === "hold" || status === "on hold") candidateCountMap[candidate].hold++;
      else if (status === "closed") candidateCountMap[candidate].closed++;
      else if (status === "unassigned" || status === "") candidateCountMap[candidate].unassigned++;
      if (escalatedFlag === "escalated") candidateCountMap[candidate].escalated++;
    });

    const sums = { open: 0, hold: 0, closed: 0, escalated: 0, unassigned: 0 };
    Object.values(candidateCountMap).forEach((c) => {
      sums.open += c.open;
      sums.hold += c.hold;
      sums.closed += c.closed;
      sums.escalated += c.escalated;
      sums.unassigned += c.unassigned;
    });

    setOpenSum(sums.open);
    setHoldSum(sums.hold);
    setClosedSum(sums.closed);
    setEscalatedSum(sums.escalated);
    setUnassignedSum(sums.unassigned);

    // Show all candidates regardless of ticket counts for selected statuses
    const filteredCandidatesArr = Object.entries(candidateCountMap);

    setFilteredCandidates(filteredCandidatesArr);
    setCurrentPage(1);
  }, [rows, searchTerm, selectedCandidates, selectedStatuses, selectedStatusKeys]);

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
            {selectedStatusKeys.includes("closed") && <div className="count-box closed">{counts.closed}</div>}
            {selectedStatusKeys.includes("escalated") && <div className="count-box escalated">{counts.escalated}</div>}
          </div>
        </div>
      );
    }
    setGridCells(cells);
  }, [filteredCandidates, currentPage, sortOrder, selectedStatusKeys]);

  useEffect(() => {
    const totalPages = Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE);
    if (totalPages <= 1) return;

    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev >= totalPages ? 1 : prev + 1));
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
          <img className="header-image" src="/IT-LOGO.png" alt="Right icon" style={{ height: 70, width: "auto" }} />
        </div>

        <div className="dashboard-header-filters" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, marginLeft: -70 }}>
          <div className="legend-bar" style={{ display: "flex", gap: 14 }}>
            {selectedStatusKeys.map((statusKey) => {
              switch (statusKey) {
                case "open":
                  return (
                    <div className="legend-item open" key="legend-open">
                      OPEN <span>{openSum.toString().padStart(3, "0")}</span>
                    </div>
                  );
                case "hold":
                  return (
                    <div className="legend-item hold" key="legend-hold">
                      HOLD <span>{holdSum.toString().padStart(3, "0")}</span>
                    </div>
                  );
                case "closed":
                  return (
                    <div className="legend-item closed" key="legend-closed">
                      CLOSED <span>{closedSum.toString().padStart(3, "0")}</span>
                    </div>
                  );
                case "escalated":
                  return (
                    <div className="legend-item escalated" key="legend-escalated">
                      ESCALATED <span>{escalatedSum.toString().padStart(3, "0")}</span>
                    </div>
                  );
                case "unassigned":
                  return (
                    <div className="legend-item unassigned" key="legend-unassigned">
                      UNASSIGNED <span>{unassignedSum.toString().padStart(3, "0")}</span>
                    </div>
                  );
                default:
                  return null;
              }
            })}
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
              styles={{ ...selectStyles, control: (base) => ({ ...base, minHeight: 40, fontWeight: 700, borderRadius: 10 }) }}
              menuPortalTarget={document.body}
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
              styles={{ ...selectStyles, control: (base) => ({ ...base, minHeight: 40, fontWeight: 700, borderRadius: 10 }) }}
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

          <input
            type="text"
            placeholder="Search candidate"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            style={{ height: 40, width: 130, borderRadius: 10, padding: "0 12px" }}
          />
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
            margin: "auto",
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
            onClick={() =>
              setCurrentPage((p) => (p > 1 ? p - 1 : Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE)))
            }
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
            onClick={() =>
              setCurrentPage((p) => (p < Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE) ? p + 1 : 1))
            }
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
