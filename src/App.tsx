import { Village } from './scene/Village';
import { ControlBar } from './ui/ControlBar';
import { InspectPanel } from './ui/InspectPanel';
import { AlertToasts } from './ui/AlertToasts';
import { Legend } from './ui/Legend';
import { SearchBar } from './ui/SearchBar';
import { KeyboardShortcuts } from './ui/KeyboardShortcuts';

export default function App() {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Village />
      <ControlBar />
      <SearchBar />
      <InspectPanel />
      <AlertToasts />
      <Legend />
      <KeyboardShortcuts />
    </div>
  );
}
