import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

// Landing page components (Preserved completely)
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import ProductIntro from "./components/ProductIntro";
import Capabilities from "./components/Capabilities";
import LiveDocumentEditor from "./components/LiveDocumentEditor";
import FeatureShowcase from "./components/FeatureShowcase";
import HowItWorks from "./components/HowItWorks";
import AIDocumentAnalysis from "./components/AIDocumentAnalysis";
import WorkflowHighlight from "./components/WorkflowHighlight";
import Pricing from "./components/Pricing";
import Footer from "./components/Footer";
import AuthModal from "./components/AuthModal";

// Dashboard
import Dashboard from "./pages/Dashboard";

// Existing Workspace Tool Components
import MergePDF from "./pages/workspace/MergePDF";
import SplitPDF from "./pages/workspace/SplitPDF";
import CompressPDF from "./pages/workspace/CompressPDF";
import RotatePDF from "./pages/workspace/RotatePDF";
import EditPDF from "./pages/workspace/EditPDF";
import WatermarkPDF from "./pages/workspace/WatermarkPDF";
import SignPDF from "./pages/workspace/SignPDF";
import PDFToWord from "./pages/workspace/PDFToWord";
import PDFToJPG from "./pages/workspace/PDFToJPG";
import WordToPDF from "./pages/workspace/WordToPDF";
import PDFToExcel from "./pages/workspace/PDFToExcel";
import PDFToPPT from "./pages/workspace/PDFToPPT";
import AIAnalysis from "./pages/workspace/AIAnalysis";
import ViewPDF from "./pages/workspace/ViewPDF";
import CreateDocument from "./pages/workspace/CreateDocument";

function Home() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const navigate = useNavigate();

  const openLogin = () => {
    setAuthMode("login");
    setAuthOpen(true);
  };

  const openSignup = () => {
    setAuthMode("signup");
    setAuthOpen(true);
  };

  const handleAuthSuccess = () => {
    setAuthOpen(false);
    navigate("/dashboard");
  };

  return (
    <>
      <Navbar
        onLoginClick={openLogin}
        onSignupClick={openSignup}
      />

      <main>
        <Hero />
        <ProductIntro />
        <Capabilities />
        <LiveDocumentEditor />
        <FeatureShowcase />
        <HowItWorks />
        <AIDocumentAnalysis />
        <WorkflowHighlight />
        <Pricing />
      </main>

      <Footer />

      <AuthModal
        isOpen={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Landing & Authentication */}
        <Route path="/" element={<Home />} />
        
        {/* Main Dashboard */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Workspace: PDF Core Utilities */}
        <Route path="/workspace/merge-pdf" element={<MergePDF />} />
        <Route path="/workspace/split-pdf" element={<SplitPDF />} />
        <Route path="/workspace/compress-pdf" element={<CompressPDF />} />
        <Route path="/workspace/rotate-pdf" element={<RotatePDF />} />
        <Route path="/workspace/edit-pdf" element={<EditPDF />} />
        <Route path="/workspace/watermark-pdf" element={<WatermarkPDF />} />
        <Route path="/workspace/sign-pdf" element={<SignPDF />} />

        {/* Workspace: Converters */}
        <Route path="/workspace/pdf-to-word" element={<PDFToWord />} />
        <Route path="/workspace/pdf-to-jpg" element={<PDFToJPG />} />
        <Route path="/workspace/word-to-pdf" element={<WordToPDF />} />
        <Route path="/workspace/pdf-to-excel" element={<PDFToExcel />} />
        <Route path="/workspace/pdf-to-ppt" element={<PDFToPPT />} />

        {/* Workspace: AI Document Intelligence */}
        <Route path="/workspace/ai-analysis" element={<AIAnalysis />} />

        {/* Workspace: Document Viewer */}
        <Route path="/workspace/view-pdf" element={<ViewPDF />} />
        <Route path="/workspace/document-viewer" element={<ViewPDF />} />

        {/* Workspace: Document Creator */}
        <Route path="/workspace/create-document" element={<CreateDocument />} />
        <Route path="/workspace/create-documents" element={<CreateDocument />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;