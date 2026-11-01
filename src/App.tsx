import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ThemeProvider } from "next-themes";
import ScrollToTop from "@/components/tr/ScrollToTop";
import Index from "./pages/Index";
const Auth = lazy(() => import("./pages/Auth"));
const Search = lazy(() => import("./pages/Search"));
const Results = lazy(() => import("./pages/Results"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const DriverProfile = lazy(() => import("./pages/DriverProfile"));

const Submit = lazy(() => import("./pages/Submit"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Teams = lazy(() => import("./pages/Teams"));
const TeamProfile = lazy(() => import("./pages/TeamProfile"));
const Contribute = lazy(() => import("./pages/Contribute"));
const CircuitProfile = lazy(() => import("./pages/CircuitProfile"));
const SeriesProfile = lazy(() => import("./pages/SeriesProfile"));
const SeriesListing = lazy(() => import("./pages/Series"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Cars = lazy(() => import("./pages/Cars"));
const CarProfile = lazy(() => import("./pages/CarProfile"));
const EventPage = lazy(() => import("./pages/EventPage"));
const Articles = lazy(() => import("./pages/Articles"));
const ArticleDetail = lazy(() => import("./pages/ArticleDetail"));
const ManageLayout = lazy(() => import("./pages/manage/ManageLayout"));
const ManageEvents = lazy(() => import("./pages/manage/ManageEvents"));
const ManageEventDetail = lazy(() => import("./pages/manage/ManageEventDetail"));
const ManageSessionResults = lazy(() => import("./pages/manage/ManageSessionResults"));
const ManageDrivers = lazy(() => import("./pages/manage/ManageDrivers"));
const ManageTeams = lazy(() => import("./pages/manage/ManageTeams"));
const ManageCars = lazy(() => import("./pages/manage/ManageCars"));
const ManageCircuits = lazy(() => import("./pages/manage/ManageCircuits"));
const ManageSeries = lazy(() => import("./pages/manage/ManageSeries"));
const ManageReports = lazy(() => import("./pages/manage/ManageReports"));
const ManagePotentialIssues = lazy(() => import("./pages/manage/ManagePotentialIssues"));
const ManageCarLiveries = lazy(() => import("./pages/manage/ManageCarLiveries"));
const ManageArticles = lazy(() => import("./pages/manage/ManageArticles"));
const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
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
          <Route path="/articles" element={<Articles />} />
          <Route path="/articles/:slug" element={<ArticleDetail />} />
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
            <Route path="articles" element={<ManageArticles />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
