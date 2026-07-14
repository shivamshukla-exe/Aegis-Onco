import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import CommandCenter from './pages/CommandCenter';
import PatientRegistry from './pages/PatientRegistry';
import GenomicsExplorer from './pages/GenomicsExplorer';
import FederatedLearning from './pages/FederatedLearning';
import TreatmentSimulator from './pages/TreatmentSimulator';
import Analytics from './pages/Analytics';

export default function App() {
  return (
    <BrowserRouter basename="/Aegis-Onco/">
      <Layout>
        <Routes>
          <Route path="/" element={<CommandCenter />} />
          <Route path="/registry" element={<PatientRegistry />} />
          <Route path="/genomics" element={<GenomicsExplorer />} />
          <Route path="/federated" element={<FederatedLearning />} />
          <Route path="/simulator" element={<TreatmentSimulator />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
