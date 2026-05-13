import { Village } from './scene/Village';
import { Village2D } from './scene/Village2D';
import { ControlBar } from './ui/ControlBar';
import { InspectPanel } from './ui/InspectPanel';
import { AlertToasts } from './ui/AlertToasts';
import { Legend } from './ui/Legend';
import { SearchBar } from './ui/SearchBar';
import { KeyboardShortcuts } from './ui/KeyboardShortcuts';
import { MetricsPanel } from './ui/MetricsPanel';
import { WeatherOverlay } from './ui/WeatherOverlay';
import { useStore } from './store';
import { useWeatherAuto } from './hooks/useWeatherAuto';

export default function App() {
  const viewMode = useStore((s) => s.viewMode);
  useWeatherAuto();
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {viewMode === '3d' ? <Village /> : <Village2D />}
      <WeatherOverlay />
      <ControlBar />
      <SearchBar />
      <InspectPanel />
      <MetricsPanel />
      <AlertToasts />
      <Legend />
      <KeyboardShortcuts />
    </div>
  );
}
