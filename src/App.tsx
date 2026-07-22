import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DarkModeProvider } from './components/DarkMode';
import { ToastProvider } from './components/Toast';
import { CommandPaletteProvider } from './components/CommandPalette';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import { LoadingSpinner } from './components/ui';

const AIAssistant = lazy(() => import('./components/AIAssistant'));
const CommandCenter = lazy(() => import('./pages/CommandCenter'));
const PatientRegistry = lazy(() => import('./pages/PatientRegistry'));
const PatientDetail = lazy(() => import('./pages/PatientDetail'));
const GenomicsExplorer = lazy(() => import('./pages/GenomicsExplorer'));
const FederatedLearning = lazy(() => import('./pages/FederatedLearning'));
const ScenarioExplorer = lazy(() => import('./pages/TreatmentSimulator'));
const Analytics = lazy(() => import('./pages/Analytics'));

function NotFound() {
  return (
    <section className="glass-card mx-auto max-w-xl rounded-3xl p-8 text-center" role="status">
      <p className="font-mono-data text-[10px] uppercase tracking-[0.18em] text-violet-600">404 · Route not found</p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-800">This research-demo view does not exist.</h1>
      <a className="mt-5 inline-flex rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white" href="/Aegis-Onco/">Return to command center</a>
    </section>
  );
}

export default function App() {
  return (
    <DarkModeProvider>
      <ToastProvider>
        <BrowserRouter basename="/Aegis-Onco/">
          <CommandPaletteProvider>
            <Layout>
              <ErrorBoundary>
                <Suspense fallback={<LoadingSpinner label="Loading research view" />}>
                  <Routes>
                    <Route path="/" element={<CommandCenter />} />
                    <Route path="/registry" element={<PatientRegistry />} />
                    <Route path="/registry/:id" element={<PatientDetail />} />
                    <Route path="/genomics" element={<GenomicsExplorer />} />
                    <Route path="/federated" element={<FederatedLearning />} />
                    <Route path="/simulator" element={<ScenarioExplorer />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
              <Suspense fallback={null}><AIAssistant /></Suspense>
            </Layout>
          </CommandPaletteProvider>
        </BrowserRouter>
      </ToastProvider>
    </DarkModeProvider>
  );
}