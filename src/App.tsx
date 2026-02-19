import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Search from "./pages/Search";
import Results from "./pages/Results";
import EventDetail from "./pages/EventDetail";
import DriverProfile from "./pages/DriverProfile";
import Admin from "./pages/Admin";
import Submit from "./pages/Submit";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";
import Teams from "./pages/Teams";
import TeamProfile from "./pages/TeamProfile";
import Contribute from "./pages/Contribute";
import CircuitProfile from "./pages/CircuitProfile";
import SeriesProfile from "./pages/SeriesProfile";
import Calendar from "./pages/Calendar";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/search" element={<Search />} />
          <Route path="/results" element={<Results />} />
          <Route path="/event/:id" element={<EventDetail />} />
          <Route path="/driver/:id" element={<DriverProfile />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/submit" element={<Submit />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/team/:id" element={<TeamProfile />} />
          <Route path="/circuit/:id" element={<CircuitProfile />} />
          <Route path="/series/:id" element={<SeriesProfile />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/contribute" element={<Contribute />} />
          <Route path="/privacy" element={<Privacy />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
