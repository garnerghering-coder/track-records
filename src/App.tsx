import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import TargetCursor from "@/components/TargetCursor";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Search from "./pages/Search";
import Results from "./pages/Results";
import EventDetail from "./pages/EventDetail";
import DriverProfile from "./pages/DriverProfile";

import Submit from "./pages/Submit";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";
import Teams from "./pages/Teams";
import TeamProfile from "./pages/TeamProfile";
import Contribute from "./pages/Contribute";
import CircuitProfile from "./pages/CircuitProfile";
import SeriesProfile from "./pages/SeriesProfile";
import SeriesListing from "./pages/Series";
import Calendar from "./pages/Calendar";
import Cars from "./pages/Cars";
import CarProfile from "./pages/CarProfile";
import EventPage from "./pages/EventPage";
import ManageLayout from "./pages/manage/ManageLayout";
import ManageEvents from "./pages/manage/ManageEvents";
import ManageEventDetail from "./pages/manage/ManageEventDetail";
import ManageSessionResults from "./pages/manage/ManageSessionResults";
import ManageDrivers from "./pages/manage/ManageDrivers";
import ManageTeams from "./pages/manage/ManageTeams";
import ManageCars from "./pages/manage/ManageCars";
import ManageCircuits from "./pages/manage/ManageCircuits";
import ManageSeries from "./pages/manage/ManageSeries";
import ManageReports from "./pages/manage/ManageReports";
import ManagePotentialIssues from "./pages/manage/ManagePotentialIssues";
import ManageCarLiveries from "./pages/manage/ManageCarLiveries";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <TargetCursor spinDuration={2} hideDefaultCursor parallaxOn hoverDuration={0.2} />
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
          
          <Route path="/submit" element={<Submit />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/team/:id" element={<TeamProfile />} />
          <Route path="/circuit/:id" element={<CircuitProfile />} />
          <Route path="/series" element={<SeriesListing />} />
          <Route path="/series/:id" element={<SeriesProfile />} />
          <Route path="/cars" element={<Cars />} />
          <Route path="/car/:id" element={<CarProfile />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/events/:slug" element={<EventPage />} />
          <Route path="/contribute" element={<Contribute />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/manage" element={<ManageLayout />}>
            <Route index element={<ManageEvents />} />
            <Route path="events" element={<ManageEvents />} />
            <Route path="events/:id" element={<ManageEventDetail />} />
            <Route path="events/:id/session/:sessionId" element={<ManageSessionResults />} />
            <Route path="drivers" element={<ManageDrivers />} />
            <Route path="teams" element={<ManageTeams />} />
            <Route path="cars" element={<ManageCars />} />
            <Route path="circuits" element={<ManageCircuits />} />
            <Route path="series" element={<ManageSeries />} />
            <Route path="reports" element={<ManageReports />} />
            <Route path="issues" element={<ManagePotentialIssues />} />
            <Route path="liveries" element={<ManageCarLiveries />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
