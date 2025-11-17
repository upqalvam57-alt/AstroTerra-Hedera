import React, { useState, useEffect } from 'react';

const AuditLog = () => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAuditLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      // Assuming your backend is running on http://127.0.0.1:8001
      const response = await fetch('http://127.0.0.1:8001/api/audit');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // The backend returns an object with an 'audit_log' key
      setAuditLogs(data.audit_log);
    } catch (e) {
      setError("Failed to fetch audit logs. Is the backend running?");
      console.error("Error fetching audit logs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []); // Fetch on component mount

  if (loading) {
    return <p>Loading audit logs...</p>;
  }

  if (error) {
    return <p style={{ color: 'red' }}>Error: {error}</p>;
  }

  return (
    <div style={{ 
      fontFamily: 'monospace', 
      whiteSpace: 'pre-wrap', 
      padding: '20px', 
      border: '1px solid #ccc', 
      borderRadius: '8px', 
      margin: '20px',
      backgroundColor: '#f9f9f9', // Light background for the whole log container
      color: '#333' // Default text color for the container
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ margin: 0, color: '#333' }}>Simulation Audit Log</h2>
        <button onClick={fetchAuditLogs} style={{ padding: '8px 15px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px' }}>
          Refresh Logs
        </button>
      </div>
      
      {auditLogs.length === 0 ? (
        <p>No audit messages found.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#e0e0e0' }}> {/* Slightly darker header background */}
              <th style={{ border: '1px solid #bbb', padding: '8px', textAlign: 'left', color: '#333' }}>Timestamp</th>
              <th style={{ border: '1px solid #bbb', padding: '8px', textAlign: 'left', color: '#333' }}>Message</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((entry, index) => (
              <tr 
                key={index} 
                style={{ 
                  borderBottom: '1px solid #eee',
                  backgroundColor: index % 2 === 0 ? '#ffffff' : '#f5f5f5' // Alternating row colors
                }}
              >
                <td style={{ border: '1px solid #ddd', padding: '8px', color: '#333' }}>{new Date(parseFloat(entry.consensus_timestamp) * 1000).toLocaleString()}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px', color: '#333' }}>{entry.audit_data.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AuditLog;
