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
import { ScrollToTop } from "./components/ScrollToTop";

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
      </Routes>
    </div>
  );
}
