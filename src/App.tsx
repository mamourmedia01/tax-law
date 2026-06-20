import { Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { Home } from "./pages/Home";
import { SearchPage } from "./pages/Search";
import { Bookings } from "./pages/Bookings";
import { Profile } from "./pages/Profile";
import { ProviderPage } from "./pages/Provider";
import { BookingFlow } from "./pages/BookingFlow";
import { BookingDetail } from "./pages/BookingDetail";
import { Dashboard } from "./pages/Dashboard";
import { ContentPage } from "./pages/ContentPage";
import { VoiceDemo } from "./pages/VoiceDemo";
import { Concierge } from "./pages/Concierge";
import { Notifications } from "./pages/Notifications";
import { Business } from "./pages/Business";
import { Vehicle } from "./pages/Vehicle";
import { ScrollToTop } from "./components/ScrollToTop";
import aboutMd from "./content/about.md?raw";
import helpMd from "./content/help.md?raw";
import termsMd from "./content/terms.md?raw";
import privacyMd from "./content/privacy.md?raw";
import customerGuideMd from "./content/customer-guide.md?raw";
import providerGuideMd from "./content/provider-guide.md?raw";
import licensesMd from "./content/licenses.md?raw";
import regulationsMd from "./content/regulations.md?raw";

function Tabbed({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="min-h-screen pb-28">{children}</main>
      <BottomNav />
    </>
  );
}

export default function App() {
  return (
    <div className="mx-auto min-h-screen max-w-app bg-canvas shadow-[0_0_60px_rgba(26,26,26,0.06)]">
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Tabbed><Home /></Tabbed>} />
        <Route path="/search" element={<Tabbed><SearchPage /></Tabbed>} />
        <Route path="/bookings" element={<Tabbed><Bookings /></Tabbed>} />
        <Route path="/profile" element={<Tabbed><Profile /></Tabbed>} />
        <Route path="/p/:slug" element={<ProviderPage />} />
        <Route path="/p/:slug/book" element={<BookingFlow />} />
        <Route path="/booking/:id" element={<BookingDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/about" element={<ContentPage title="About Fable+" markdown={aboutMd} />} />
        <Route path="/help" element={<ContentPage title="Help Centre" markdown={helpMd} />} />
        <Route path="/legal/terms" element={<ContentPage title="Terms of Service" markdown={termsMd} draft />} />
        <Route path="/legal/privacy" element={<ContentPage title="Privacy Policy" markdown={privacyMd} draft />} />
        <Route path="/legal/licenses" element={<ContentPage title="Licenses" markdown={licensesMd} />} />
        <Route path="/legal/regulations" element={<ContentPage title="Regulations & Compliance" markdown={regulationsMd} />} />
        <Route path="/guide/customer" element={<ContentPage title="Customer Guide" markdown={customerGuideMd} />} />
        <Route path="/guide/provider" element={<ContentPage title="Provider Guide" markdown={providerGuideMd} />} />
        <Route path="/voice" element={<VoiceDemo />} />
        <Route path="/concierge" element={<Concierge />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/business" element={<Business />} />
        <Route path="/vehicle" element={<Vehicle />} />
      </Routes>
    </div>
  );
}
