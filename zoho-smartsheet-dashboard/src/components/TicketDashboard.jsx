import React, { useEffect, useState } from "react";
import Select, { components } from "react-select";
import "./TicketDashboard.css";

const TICKET_RAISER_COL_ID = 4549002565209988;
const STATUS_COL_ID = 3317549542100868;
const ESCALATED_COL_ID = 6800802378895236;
const candidatesPerPage = 24;

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

// Hide selected tags (chips) for cleaner UI with only checkboxes visible in dropdown
const MultiValueContainer = () => null;

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
      .then((sheet) => {
        if (sheet && sheet.rows) setRows(sheet.rows);
        else setRows([]);
      })
      .catch(() => setRows([]));
  }, []);

  const allCandidateNames = Array.from(
    new Set(
      rows
        .map((row) =>
          (row.cells.find((c) => c.columnId === TICKET_RAISER_COL_ID)?.value || "").trim()
        )
        .filter(Boolean)
    )
  );

  const candidateOptions = allCandidateNames.map((name) => ({
    value: name,
    label: name,
  }));

  const statusOptions = [
    { value: "open", label: "Open" },
    { value: "closed", label: "Closed" },
    { value: "hold", label: "Hold" },
    { value: "escalated", label: "Escalated" },
    { value: "unassigned", label: "Unassigned" },
  ];

  // This decides which statuses are shown; if none, show all by default.
  const selectedStatusKeys = selectedStatuses.length
    ? selectedStatuses.map((s) => s.value)
    : ["open", "hold", "closed", "escalated", "unassigned"];


  useEffect(() => {
    const filteredRows = rows.filter((row) => {
      const candidateNameRaw = (
        row.cells.find((c) => c.columnId === TICKET_RAISER_COL_ID)?.value || ""
      ).trim();
      const candidateName = candidateNameRaw.toLowerCase();

      const status = (
        row.cells.find((c) => c.columnId === STATUS_COL_ID)?.value || ""
      )
        .toLowerCase()
        .trim();
      const escalatedFlag = (
        row.cells.find((c) => c.columnId === ESCALATED_COL_ID)?.value || ""
      )
        .toLowerCase()
        .trim();

      const searchMatch = candidateName.includes(searchTerm.toLowerCase());
      const multiSelectMatch =
        selectedCandidates.length === 0 ||
        selectedCandidates.some((opt) => opt.value === candidateNameRaw);

      const statusMatched =
        selectedStatuses.length === 0 ||
        selectedStatuses.some((s) => {
          if (s.value === "escalated") return escalatedFlag === "escalated";
          if (s.value === "hold") return status === "on hold" || status === "hold";
          else return status === s.value;
        });

      return searchMatch && multiSelectMatch && statusMatched;
    });

    const candidateMap = {};
    filteredRows.forEach((row) => {
      const candidate = (
        row.cells.find((c) => c.columnId === TICKET_RAISER_COL_ID)?.value || ""
      ).trim();
      if (!candidate) return;

      const status = (
        row.cells.find((c) => c.columnId === STATUS_COL_ID)?.value || ""
      )
        .toLowerCase()
        .trim();
      const escalatedFlag = (
        row.cells.find((c) => c.columnId === ESCALATED_COL_ID)?.value || ""
      )
        .toLowerCase()
        .trim();

      if (!candidateMap[candidate]) {
        candidateMap[candidate] = {
          open: 0,
          hold: 0,
          closed: 0,
          escalated: 0,
          unassigned: 0,
        };
      }

      if (status === "open") candidateMap[candidate].open++;
      else if (status === "on hold") candidateMap[candidate].hold++;
      else if (status === "closed") candidateMap[candidate].closed++;
      else if (status === "unassigned" || status === "")
        candidateMap[candidate].unassigned++;

      if (escalatedFlag === "escalated") candidateMap[candidate].escalated++;
    });

    const candidatesArr = Object.entries(candidateMap);

    let open = 0,
      hold = 0,
      closed = 0,
      escalated = 0,
      unassigned = 0;
    candidatesArr.forEach(([_, val]) => {
      open += val.open;
      hold += val.hold;
      closed += val.closed;
      escalated += val.escalated;
      unassigned += val.unassigned;
    });

    setFilteredCandidates(candidatesArr);
    setOpenSum(open);
    setHoldSum(hold);
    setClosedSum(closed);
    setEscalatedSum(escalated);
    setUnassignedSum(unassigned);
    setCurrentPage(1);
  }, [rows, searchTerm, selectedCandidates, selectedStatuses]);

  useEffect(() => {
    const totalPages = Math.ceil(filteredCandidates.length / candidatesPerPage);
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);

    const sortedFilteredCandidates = [...filteredCandidates].sort((a, b) => {
      if (a[0] < b[0]) return sortOrder === "asc" ? -1 : 1;
      if (a[0] > b[0]) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const start = (currentPage - 1) * candidatesPerPage;
    const end = Math.min(start + candidatesPerPage, sortedFilteredCandidates.length);

    const cells = [];
    for (let i = start; i < end; i++) {
      const [candidate, counts] = sortedFilteredCandidates[i];
      cells.push(
        <div
          key={candidate}
          className="grid-cell"
          style={{ animationDelay: `${(i - start) * 65}ms` }}
        >
          <div className="candidate-name">{candidate}</div>
          <div className="ticket-counts">
            {selectedStatusKeys.includes("open") && (
              <div className="count-box open">{counts.open}</div>
            )}
            {selectedStatusKeys.includes("hold") && (
              <div className="count-box hold">{counts.hold}</div>
            )}
            {selectedStatusKeys.includes("closed") && (
              <div className="count-box closed">{counts.closed}</div>
            )}
            {selectedStatusKeys.includes("escalated") && (
              <div className="count-box escalated">{counts.escalated}</div>
            )}
            {/* Uncomment if you want to show unassigned card counts */}
            {/* {selectedStatusKeys.includes("unassigned") && (
              <div className="count-box unassigned">{counts.unassigned}</div>
            )} */}
          </div>
        </div>
      );
    }
    setGridCells(cells);
  }, [filteredCandidates, currentPage, sortOrder, selectedStatusKeys]);

  useEffect(() => {
    const totalPages = Math.ceil(filteredCandidates.length / candidatesPerPage);
    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev >= totalPages ? 1 : prev + 1));
    }, 10000);
    return () => clearInterval(interval);
  }, [filteredCandidates]);

  return (
    <>
      <div
        className="dashboard-header-main"
        style={{ maxWidth: 1300, margin: "0 auto 30px auto" }}
      >
        {/* Top row: logo, title, right icon */}
        <div
          className="dashboard-header-top"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
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

        {/* Second row: selects and filters */}
        <div
          className="dashboard-header-filters"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 20,
          }}
        >
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

          <div style={{ minWidth: 180 }}>
            <Select
              closeMenuOnSelect={false}
              hideSelectedOptions={false}
              components={{ Option, MultiValueContainer }}
              isMulti
              options={candidateOptions}
              value={selectedCandidates}
              onChange={setSelectedCandidates}
              placeholder="Select persons"
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: 40,
                  fontWeight: 700,
                  borderRadius: 10,
                }),
                menu: (base) => ({ ...base, zIndex: 9999 }),
                placeholder: (base) => ({ ...base, fontWeight: 700 }),
              }}
            />
          </div>

          <div style={{ minWidth: 250 }}>
            <Select
              closeMenuOnSelect={false}
              hideSelectedOptions={false}
              components={{ Option, MultiValueContainer }}
              isMulti
              options={statusOptions}
              value={selectedStatuses}
              onChange={setSelectedStatuses}
              placeholder="Select statuses to filter"
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: 40,
                  fontWeight: 700,
                  borderRadius: 10,
                }),
                menu: (base) => ({ ...base, zIndex: 9999 }),
                placeholder: (base) => ({ ...base, fontWeight: 700 }),
              }}
            />
          </div>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            style={{
              height: 40,
              width: 75,
              fontWeight: 700,
              borderRadius: 10,
              padding: "0 8px",
              fontSize: 16,
              backgroundColor: "#fff",
              border: "1px solid #ffc107",
              color: "#8a6d00",
            }}
          >
            <option value="asc">Sort Ascending</option>
            <option value="desc">Sort Descending</option>
          </select>

          <input
            type="text"
            placeholder="Search candidate"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              width: 150,
              padding: "6px 12px",
              fontSize: 16,
              fontWeight: 700,
              borderRadius: 10,
              border: "1px solid #ffc107",
              boxShadow:
                "0 6px 15px rgba(0, 0, 0, 0.11), inset 1px 1px 3px rgba(255,255,255,0.7), inset -1px -1px 3px rgba(180,180,180,0.6)",
              textAlign: "center",
              color: "#8a6d00",
              backgroundColor: "#fff",
              outline: "none",
              transition: "border-color 0.3s ease",
              marginLeft: 0,
            }}
          />
        </div>
      </div>

      <div className="grid-container">{gridCells}</div>

      <div className="pagination-container">
        <button
          className="pagination-arrow"
          onClick={() =>
            setCurrentPage((prev) =>
              prev > 1
                ? prev - 1
                : Math.ceil(filteredCandidates.length / candidatesPerPage)
            )
          }
        >
          &lt;
        </button>

        {Array.from({
          length: Math.ceil(filteredCandidates.length / candidatesPerPage),
        }).map((_, i) => (
          <span
            key={i}
            className={`pagination-dot ${currentPage === i + 1 ? "active" : ""}`}
            onClick={() => setCurrentPage(i + 1)}
          >
            &#9679;
          </span>
        ))}

        <button
          className="pagination-arrow"
          onClick={() =>
            setCurrentPage((prev) =>
              prev < Math.ceil(filteredCandidates.length / candidatesPerPage)
                ? prev + 1
                : 1
            )
          }
        >
          &gt;
        </button>
      </div>
    </>
  );
}

export default TicketDashboard;
