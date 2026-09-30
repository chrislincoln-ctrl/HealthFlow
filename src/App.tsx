import { Navigate, Route, Routes } from 'react-router-dom';
import { ScenarioProvider } from './state/ScenarioContext';
import { InterventionProvider } from './state/InterventionContext';
import { TourActionsProvider } from './state/tourActions';
import { ThemeProvider } from './state/ThemeContext';
import { AuthProvider } from './state/AuthContext';
import { RequireAuth } from './components/RequireAuth';
import { Layout } from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import CommandCenter from './pages/CommandCenter';
import DemandIntelligence from './pages/DemandIntelligence';
import RedistributionEngine from './pages/RedistributionEngine';
import ActionCenter from './pages/ActionCenter';
import EmergencySimulator from './pages/EmergencySimulator';
import Understand from './pages/Understand';
import PolicyBrief from './pages/PolicyBrief';
import Federation from './pages/Federation';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ScenarioProvider>
          <InterventionProvider>
          <TourActionsProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Landing />} />
              <Route path="/command-center" element={<CommandCenter />} />
              <Route path="/understand" element={<Understand />} />
              <Route path="/demand" element={<DemandIntelligence />} />
              <Route path="/redistribution" element={<RedistributionEngine />} />
              <Route path="/action-center" element={<ActionCenter />} />
              <Route path="/federation" element={<Federation />} />
              <Route path="/simulator" element={<EmergencySimulator />} />
              <Route path="/policy" element={<PolicyBrief />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </TourActionsProvider>
          </InterventionProvider>
        </ScenarioProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}