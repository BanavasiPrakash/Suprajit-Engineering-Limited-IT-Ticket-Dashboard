import React, { useEffect, useState, useMemo, useRef } from "react";
import Select, { components } from "react-select";
import { FaBars } from "react-icons/fa";
import "./TicketDashboard.css";

const ASSIGNEE_COL_ID = 4549002565209988;
const OPEN_STATUS_COL_ID = 1001;
const HOLD_STATUS_COL_ID = 1003;
const ESCALATED_STATUS_COL_ID = 1004;
const UNASSIGNED_STATUS_COL_ID = 1005;
const IN_PROGRESS_STATUS_COL_ID = 1006;

const CANDIDATES_PER_PAGE = 24;

const Option = (props) => (
  <components.Option {...props}>
    <input type="checkbox" checked={props.isSelected} readOnly style={{ marginRight: 8 }} tabIndex={-1} />
    {props.label}
  </components.Option>
);

const selectStyles = {
  control: (base) => ({
    ...base,
    minWidth: 100,
    maxWidth: 200,
    height: 40,
    background: "linear-gradient(145deg, #d0daf9, #a3baff)",
    borderRadius: 18,
    border: "1px solid #5e7ce4",
    boxShadow: "8px 8px 28px rgba(63,81,181,0.8), inset 6px 6px 14px #fff, inset -6px -6px 14px rgba(48,62,142,0.85)",
    fontWeight: 700,
    fontSize: 14,
    textTransform: "uppercase",
    fontFamily: "'Poppins',sans-serif",
    padding: "0 1px",
  }),
  valueContainer: (base) => ({
    ...base,
    paddingRight: 0,
  }),
  multiValue: () => ({ display: "none" }),
  multiValueLabel: () => ({ display: "none" }),
  multiValueRemove: () => ({ display: "none" }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

async function fetchZohoDataFromBackend(setRows, setError) {
  try {
    const url = "http://localhost:5000/api/zoho-assignees-with-ticket-counts";
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch Zoho assignee ticket counts");
    const data = await response.json();

    const rows = data.map((member) => ({
      cells: [
        { columnId: ASSIGNEE_COL_ID, value: member.name },
        { columnId: OPEN_STATUS_COL_ID, value: member.tickets.open?.toString() || "0" },
        { columnId: HOLD_STATUS_COL_ID, value: member.tickets.hold?.toString() || "0" },
        { columnId: ESCALATED_STATUS_COL_ID, value: member.tickets.escalated?.toString() || "0" },
        { columnId: UNASSIGNED_STATUS_COL_ID, value: member.tickets.unassigned?.toString() || "0" },
        { columnId: IN_PROGRESS_STATUS_COL_ID, value: member.tickets.inProgress?.toString() || "0" },
      ],
      latestUnassignedTicketId: member.latestUnassignedTicketId || null,
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
  const [holdSum, setHoldSum] = useState(0);
  const [escalatedSum, setEscalatedSum] = useState(0);
  const [unassignedSum, setUnassignedSum] = useState(0);
  const [inProgressSum, setInProgressSum] = useState(0);
  const [filteredCandidates, setFilteredCandidates] = useState([]);
  const [gridCells, setGridCells] = useState([]);
  const [filtersVisible, setFiltersVisible] = useState(true);

  const [unassignedBlink, setUnassignedBlink] = useState(false);
  const prevUnassignedCountRef = useRef(unassignedSum);
  const [popupContent, setPopupContent] = useState("");
  const [showPopup] = useState(true);

  const intervalRef = useRef(null);

  const statusOptions = [
    { value: "open", label: "Open" },
    { value: "hold", label: "Hold" },
    { value: "inProgress", label: "In Progress" },
    { value: "escalated", label: "Escalated" },
    { value: "unassigned", label: "Unassigned" },
    { value: "total", label: "Total" },
  ];

  useEffect(() => {
    const cachedRows = localStorage.getItem("ticketDashboardRows");
    if (cachedRows) setRows(JSON.parse(cachedRows));
    fetchZohoDataFromBackend(setRows, setError);
  }, []);

  const nonZeroRows = useMemo(() => rows, [rows]);

  const candidateOptions = useMemo(() => {
    const setNames = new Set();
    nonZeroRows.forEach((row) => {
      const name = row.cells.find((c) => c.columnId === ASSIGNEE_COL_ID)?.value?.trim();
      if (name) setNames.add(name);
    });
    return Array.from(setNames)
      .sort()
      .map((name) => ({ value: name, label: name }));
  }, [nonZeroRows]);

  const selectedStatusKeys = useMemo(
    () =>
      selectedStatuses.length > 0
        ? selectedStatuses.map((s) => s.value)
        : statusOptions.map((s) => s.value),
    [selectedStatuses]
  );

  const personFilterOption = (option, inputValue) => {
    if (!inputValue) return true;
    if (selectedCandidates.find((sel) => sel.value === option.value)) return true;
    return option.label.toLowerCase().includes(inputValue.toLowerCase());
  };

  useEffect(() => {
    const filteredRows = nonZeroRows.filter((row) => {
      const candidateRaw =
        row.cells.find((c) => c.columnId === ASSIGNEE_COL_ID)?.value?.trim() || "";
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
          escalated: 0,
          unassigned: 0,
          inProgress: 0,
          latestUnassignedTicketId: row.latestUnassignedTicketId || null,
        };
      }

      if (selectedStatusKeys.includes("open"))
        candidateCountMap[candidate].open += cellsById[OPEN_STATUS_COL_ID];
      if (selectedStatusKeys.includes("hold"))
        candidateCountMap[candidate].hold += cellsById[HOLD_STATUS_COL_ID];
      if (selectedStatusKeys.includes("inProgress"))
        candidateCountMap[candidate].inProgress += cellsById[IN_PROGRESS_STATUS_COL_ID];
      if (selectedStatusKeys.includes("escalated"))
        candidateCountMap[candidate].escalated += cellsById[ESCALATED_STATUS_COL_ID];
      if (selectedStatusKeys.includes("unassigned"))
        candidateCountMap[candidate].unassigned += cellsById[UNASSIGNED_STATUS_COL_ID];
    });

    const sums = { open: 0, hold: 0, escalated: 0, unassigned: 0, inProgress: 0 };
    Object.values(candidateCountMap).forEach((c) => {
      sums.open += c.open;
      sums.hold += c.hold;
      sums.escalated += c.escalated;
      sums.unassigned += c.unassigned;
      sums.inProgress += c.inProgress;
    });

    setOpenSum(sums.open);
    setHoldSum(sums.hold);
    setEscalatedSum(sums.escalated);
    setUnassignedSum(sums.unassigned);
    setInProgressSum(sums.inProgress);

    setFilteredCandidates(Object.entries(candidateCountMap));
    setCurrentPage(1);

    // Update popupContent to show latest unassigned ticket number in popup
    const unassignedEntries = Object.entries(candidateCountMap).filter(
      ([_, counts]) => counts.unassigned > 0
    );
    const popupTexts = unassignedEntries.map(([candidate, counts]) => {
      if (counts.latestUnassignedTicketId)
        return `${counts.latestUnassignedTicketId} - ${candidate}`;
      return `${counts.unassigned} - ${candidate}`;
    });

    setPopupContent(popupTexts.join(" | "));
  }, [
    nonZeroRows,
    searchTerm,
    selectedCandidates,
    selectedStatuses,
    selectedStatusKeys,
  ]);

  useEffect(() => {
    const sortedFilteredCandidates = [...filteredCandidates].sort((a, b) => {
      if (a[0] < b[0]) return sortOrder === "asc" ? -1 : 1;
      if (a[0] > b[0]) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const nonZeroFilteredCandidates = sortedFilteredCandidates.filter(
      ([_, counts]) =>
        counts.open > 0 ||
        counts.hold > 0 ||
        counts.escalated > 0 ||
        counts.unassigned > 0 ||
        counts.inProgress > 0
    );

    const totalPages = Math.ceil(nonZeroFilteredCandidates.length / CANDIDATES_PER_PAGE);

    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);

    const start = (currentPage - 1) * CANDIDATES_PER_PAGE;
    const end = Math.min(start + CANDIDATES_PER_PAGE, nonZeroFilteredCandidates.length);

    const cells = [];
    for (let i = start; i < end; i++) {
      const [candidate, counts] = nonZeroFilteredCandidates[i];
      const totalSelected = selectedStatusKeys.includes("total");
      const selectedStatusesExcludingTotal = selectedStatusKeys.filter(
        (k) => k !== "total"
      );
      const sumSelectedStatuses = selectedStatusesExcludingTotal.reduce(
        (sum, key) => sum + (counts[key] || 0),
        0
      );
      const showSumOnly = totalSelected && selectedStatusesExcludingTotal.length > 0;

      cells.push(
        <div
          key={candidate}
          className="grid-cell"
          style={{ animationDelay: `${(i - start) * 65}ms` }}
        >
          <div className="candidate-name">{candidate}</div>
          <div className="ticket-counts" style={{ justifyContent: "center" }}>
            {showSumOnly ? (
              <div className="count-box total">{sumSelectedStatuses}</div>
            ) : selectedStatusesExcludingTotal.length > 0 ? (
              <>
                {selectedStatusKeys.includes("open") && (
                  <div className="count-box open">{counts.open}</div>
                )}
                {selectedStatusKeys.includes("hold") && (
                  <div className="count-box hold">{counts.hold}</div>
                )}
                {selectedStatusKeys.includes("inProgress") && (
                  <div className="count-box inprogress">{counts.inProgress}</div>
                )}
                {selectedStatusKeys.includes("escalated") && (
                  <div className="count-box escalated">{counts.escalated}</div>
                )}
                {selectedStatusKeys.includes("unassigned") && (
                  <div className="count-box unassigned">{counts.unassigned}</div>
                )}
              </>
            ) : (
              <div className="count-box total">
                {counts.open +
                  counts.hold +
                  counts.escalated +
                  counts.unassigned +
                  counts.inProgress}
              </div>
            )}
          </div>
        </div>
      );
    }

    setGridCells(cells);
  }, [filteredCandidates, currentPage, sortOrder, selectedStatusKeys]);

  useEffect(() => {
    if (unassignedSum > 0) setUnassignedBlink(true);
    else setUnassignedBlink(false);
    prevUnassignedCountRef.current = unassignedSum;
  }, [unassignedSum]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const totalPages = Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE);
    if (totalPages > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentPage((prev) => (prev < totalPages ? prev + 1 : 1));
      }, 10000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [filteredCandidates]);

  const showLegendTotal = selectedStatuses.some((s) => s.value === "total");

  const totalPagesForPagination = Math.ceil(
    filteredCandidates.filter(
      ([_, counts]) =>
        counts.open > 0 ||
        counts.hold > 0 ||
        counts.escalated > 0 ||
        counts.unassigned > 0 ||
        counts.inProgress > 0
    ).length / CANDIDATES_PER_PAGE
  );

  return (
    <>
      <div
        className="dashboard-header-main"
        style={{ maxWidth: 1300, margin: "0 auto 30px auto", position: "relative" }}
      >
        {showPopup && (
          <div className="moving-popup" aria-live="polite" role="alert">
            {popupContent}
          </div>
        )}

        <div
          className="dashboard-header-top"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
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
              fontSize: 60,
              letterSpacing: 2,
              color: "#e0eaff",
              textShadow: "2px 2px 6px rgba(0, 0, 50, 0.7)",
              userSelect: "none",
              textTransform: "uppercase",
              position: "relative",
              zIndex: 2,
            }}
          >
            TICKET DASHBOARD
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 10,
              position: "relative",
              zIndex: 2,
            }}
          >
            <img
              className="header-image"
              src="/IT-LOGO.png"
              alt="Right icon"
              style={{ height: 70, width: "auto" }}
            />
            <button
              className="hamburger-btn"
              style={{
                marginTop: 5,
                width: 25,
                height: 25,
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
              }}
              onClick={() => setFiltersVisible((v) => !v)}
              aria-label="Toggle filters"
            >
              <FaBars size={15} color="#34495e" />
            </button>
          </div>
        </div>

        <div
          className="dashboard-header-filters"
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            display: "flex",
            justifyContent: filtersVisible ? "flex-end" : "center",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div className="legend-bar" style={{ display: "flex", gap: 10 }}>
            <div className="legend-item open">
              OPEN <span>{openSum.toString().padStart(3, "0")}</span>
            </div>
            <div className="legend-item hold">
              HOLD <span>{holdSum.toString().padStart(3, "0")}</span>
            </div>
            <div className="legend-item inprogress">
              IN PROGRESS <span>{inProgressSum.toString().padStart(3, "0")}</span>
            </div>
            <div
              className={`legend-item unassigned ${unassignedBlink ? "blink-red" : ""}`}
              style={{ minWidth: "160px" }}
            >
              UNASSIGNED&nbsp;
              <span>{unassignedSum.toString().padStart(3, "0")}</span>
              {rows.length > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    padding: "0 6px",
                    backgroundColor: "#ff6666",
                    borderRadius: 12,
                    color: "#fff",
                    fontWeight: "700",
                    fontSize: "14px",
                    userSelect: "none",
                  }}
                >
                  {
                    rows.find((r) =>
                      r.cells.some(
                        (c) =>
                          c.columnId === ASSIGNEE_COL_ID &&
                          c.value.toLowerCase() === "unassigned"
                      )
                    )?.latestUnassignedTicketId || ""
                  }
                </span>
              )}
            </div>
            <div className="legend-item escalated">
              ESCALATED <span>{escalatedSum.toString().padStart(3, "0")}</span>
            </div>
            {showLegendTotal && (
              <div
                className="legend-item total"
                style={{
                  backgroundColor: "#ffd700",
                  color: "#34495e",
                  fontWeight: 700,
                  borderRadius: 12,
                  padding: "0 10px",
                  minWidth: "120px",
                }}
              >
                TOTAL{" "}
                <span>
                  {(
                    (selectedStatusKeys.includes("open") ? openSum : 0) +
                    (selectedStatusKeys.includes("hold") ? holdSum : 0) +
                    (selectedStatusKeys.includes("inProgress") ? inProgressSum : 0) +
                    (selectedStatusKeys.includes("escalated") ? escalatedSum : 0) +
                    (selectedStatusKeys.includes("unassigned") ? unassignedSum : 0)
                  )
                    .toString()
                    .padStart(3, "0")}
                </span>
              </div>
            )}
          </div>

          <div
            style={{
              display: filtersVisible ? "flex" : "none",
              alignItems: "center",
              gap: 2,
            }}
          >
            <div style={{ minWidth: 210 }}>
              <Select
                closeMenuOnSelect={false}
                hideSelectedOptions={false}
                components={{ Option }}
                isMulti
                options={candidateOptions}
                value={selectedCandidates}
                onChange={setSelectedCandidates}
                placeholder="Search persons"
                styles={selectStyles}
                menuPortalTarget={document.body}
                filterOption={personFilterOption}
                isSearchable
                menuPlacement="auto"
                maxMenuHeight={240}
              />
            </div>

            <div style={{ minWidth: 210 }}>
              <Select
                closeMenuOnSelect={false}
                hideSelectedOptions={false}
                components={{ Option }}
                isMulti
                options={statusOptions}
                value={selectedStatuses}
                onChange={setSelectedStatuses}
                placeholder="Select statuses"
                styles={selectStyles}
                menuPortalTarget={document.body}
              />
            </div>

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{ height: 40, width: 20, borderRadius: 10 }}
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>
        </div>

        <div
          className="grid-container"
          style={{
            marginTop: 30,
            display: "grid",
            gap: "18px",
            gridTemplateColumns: "repeat(6, 1fr)",
            gridTemplateRows: "repeat(4, auto)",
            maxWidth: 1400,
          }}
        >
          {gridCells}
        </div>

        <div
          className="pagination-container"
          style={{ marginTop: 20, textAlign: "center" }}
        >
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
              setCurrentPage((p) =>
                p > 1 ? p - 1 : Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE)
              )
            }
            aria-label="Previous page"
          >
            {"<"}
          </button>

          {[...Array(Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE)).keys()].map(
            (i) => (
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
            )
          )}

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
              setCurrentPage((p) =>
                p < Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE) ? p + 1 : 1
              )
            }
            aria-label="Next page"
          >
            {">"}
          </button>
        </div>
      </div>
    </>
  );
}

export default TicketDashboard;
