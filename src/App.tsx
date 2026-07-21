import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DarkModeProvider } from './components/DarkMode';
import { ToastProvider } from './components/Toast';
import { CommandPaletteProvider } from './components/CommandPalette';
import Layout from './components/Layout';
import AIAssistant from './components/AIAssistant';
import CommandCenter from './pages/CommandCenter';
import PatientRegistry from './pages/PatientRegistry';
import PatientDetail from './pages/PatientDetail';
import GenomicsExplorer from './pages/GenomicsExplorer';
import FederatedLearning from './pages/FederatedLearning';
import TreatmentSimulator from './pages/TreatmentSimulator';
import Analytics from './pages/Analytics';

export default function App() {
  return (
    <DarkModeProvider>
      <ToastProvider>
        <BrowserRouter basename="/Aegis-Onco/">
          <CommandPaletteProvider>
            <Layout>
              <Routes>
                <Route path="/" element={<CommandCenter />} />
                <Route path="/registry" element={<PatientRegistry />} />
                <Route path="/registry/:id" element={<PatientDetail />} />
                <Route path="/genomics" element={<GenomicsExplorer />} />
                <Route path="/federated" element={<FederatedLearning />} />
                <Route path="/simulator" element={<TreatmentSimulator />} />
                <Route path="/analytics" element={<Analytics />} />
              </Routes>
              <AIAssistant />
            </Layout>
          </CommandPaletteProvider>
        </BrowserRouter>
      </ToastProvider>
    </DarkModeProvider>
  );
}
