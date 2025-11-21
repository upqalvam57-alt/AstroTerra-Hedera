import React from 'react';

const AuditLog = ({ logs, loading, error }) => {
  if (loading) {
    return <p>Loading audit logs...</p>;
  }

  if (error) {
    return <p style={{ color: '#ff6b6b' }}>Error: {error}</p>;
  }

  return (
    <>
      {logs.length === 0 ? (
        <p>No audit messages found for the selected criteria.</p>
      ) : (
        <table className="audit-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((entry, index) => (
              <tr key={index}>
                <td>{new Date(parseFloat(entry.consensus_timestamp) * 1000).toLocaleString()}</td>
                <td>{entry.audit_data.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
};

export default AuditLog;