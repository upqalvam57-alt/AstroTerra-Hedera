import React, { useState, useEffect } from 'react';
import AuditLog from './AuditLog';
import DatePicker from 'react-datepicker';

import "react-datepicker/dist/react-datepicker.css";
import './Audit.css';

const App = () => {
  // State for the logs actually shown on the screen
  const [displayedLogs, setDisplayedLogs] = useState([]); 

  // Separate loading states for clarity
  const [isLoading, setIsLoading] = useState(true); // For initial load
  const [isSearching, setIsSearching] = useState(false); // For search button action
  
  const [error, setError] = useState(null);

  // State for UI controls
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedPhase, setSelectedPhase] = useState('Phase 2');
  const phaseOptions = ["Phase 2", "Phase 3", "Phase 4", "Phase 5", "Phase 6", "Phase 7"];

  // Fetches all logs, used for initial load and "Refresh" button
  const fetchAllLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/audit');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setDisplayedLogs(data.audit_log || []);
    } catch (e) {
      setError("Failed to fetch audit logs. Is the backend running?");
      console.error("Error fetching audit logs:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Run fetchAllLogs only on the initial component mount
  useEffect(() => {
    fetchAllLogs();
  }, []);

  // Performs a parameterized search against the backend
  const handleSearch = async () => {
    if (!selectedDate || !selectedPhase) return;

    setIsSearching(true);
    setError(null);

    // Format the date to YYYY-MM-DD for the API query
    const selYear = selectedDate.getFullYear();
    const selMonth = selectedDate.getMonth() + 1;
    const selDay = selectedDate.getDate();
    const dateQueryParam = `${selYear}-${String(selMonth).padStart(2, '0')}-${String(selDay).padStart(2, '0')}`;

    try {
      // Assumes a backend endpoint that can handle these query parameters
      // e.g., /api/audit?date=2025-11-18&phase=Phase%202
      const response = await fetch(`/api/audit?date=${dateQueryParam}&phase=${encodeURIComponent(selectedPhase)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setDisplayedLogs(data.audit_log || []);
    } catch (e) {
      setError("Failed to perform search. Is the backend search endpoint available?");
      console.error("Error searching audit logs:", e);
    } finally {
      setIsSearching(false);
    }
  };

  const areInputsIncomplete = !selectedDate || !selectedPhase;
  // Disable controls during any loading state
  const isControlDisabled = isLoading || isSearching;

  return (
    <div className="audit-container">
      <h1>Simulation Audit Trail</h1>
      
      <div className="controls-container">
        <div className="search-filter-container">
          <DatePicker
            selected={selectedDate}
            onChange={(date) => setSelectedDate(date)}
            isClearable
            placeholderText="Select a date to filter"
            dateFormat="MMMM d, yyyy"
            disabled={isControlDisabled}
          />
          
          <select value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)} disabled={isControlDisabled}>
            {phaseOptions.map(phase => (
              <option key={phase} value={phase}>{phase}</option>
            ))}
          </select>

          <button onClick={handleSearch} disabled={areInputsIncomplete || isControlDisabled}>
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
        
        {(!isLoading && !error) && (
          <button onClick={fetchAllLogs} disabled={isControlDisabled}>
            Refresh All Logs
          </button>
        )}
      </div>

      <AuditLog logs={displayedLogs} loading={isLoading} error={error} />
    </div>
  );
};

export default App;
