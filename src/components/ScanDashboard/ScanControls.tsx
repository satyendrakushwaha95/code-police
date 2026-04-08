import { useState, useEffect } from 'react';
import { useScanContext } from '../../store/ScanContext';
import { useWorkspace } from '../../store/WorkspaceContext';

export default function ScanControls() {
  const { state, startScan, stopScan } = useScanContext();
  const { state: workspace } = useWorkspace();

  const { isScanning, profiles } = state;
  const rootPath = workspace.rootPath;

  const [selectedProfile, setSelectedProfile] = useState('full');
  const [enableLlm, setEnableLlm] = useState(false);

  useEffect(() => {
    const profile = profiles.find(p => p.id === selectedProfile);
    if (profile) {
      setEnableLlm(profile.enableLlmReview);
    }
  }, [selectedProfile, profiles]);

  useEffect(() => {
    if (profiles.length > 0 && !profiles.find(p => p.id === selectedProfile)) {
      setSelectedProfile(profiles[0].id);
    }
  }, [profiles, selectedProfile]);

  const handleStart = async () => {
    if (!rootPath) return;
    await startScan(rootPath, selectedProfile, enableLlm);
  };

  return (
    <div className="scan-controls">
      <div className="scan-controls-field">
        <label htmlFor="scan-profile-select">Scan Profile</label>
        <select
          id="scan-profile-select"
          value={selectedProfile}
          onChange={e => setSelectedProfile(e.target.value)}
          disabled={isScanning}
        >
          {profiles.length === 0 && (
            <option value="full">Full Scan</option>
          )}
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <label className="scan-controls-checkbox">
        <input
          type="checkbox"
          checked={enableLlm}
          onChange={e => setEnableLlm(e.target.checked)}
          disabled={isScanning}
        />
        Enable LLM Deep Analysis
      </label>

      {isScanning ? (
        <button className="scan-btn scan-btn-stop" onClick={stopScan}>
          Stop Scan
        </button>
      ) : (
        <button
          className="scan-btn scan-btn-start"
          onClick={handleStart}
          disabled={!rootPath}
        >
          Start Scan
        </button>
      )}
    </div>
  );
}
