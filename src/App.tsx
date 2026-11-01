import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ThemeProvider } from "next-themes";
import ScrollToTop from "@/components/tr/ScrollToTop";
import Index from "./pages/Index";
const Search = lazy(() => import("./pages/Search"));
const Results = lazy(() => import("./pages/Results"));
const DriverProfile = lazy(() => import("./pages/DriverProfile"));

const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Teams = lazy(() => import("./pages/Teams"));
const TeamProfile = lazy(() => import("./pages/TeamProfile"));
const CircuitProfile = lazy(() => import("./pages/CircuitProfile"));
const SeriesProfile = lazy(() => import("./pages/SeriesProfile"));
const SeriesListing = lazy(() => import("./pages/Series"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Cars = lazy(() => import("./pages/Cars"));
const CarProfile = lazy(() => import("./pages/CarProfile"));
const EventPage = lazy(() => import("./pages/EventPage"));
const Articles = lazy(() => import("./pages/Articles"));
const ArticleDetail = lazy(() => import("./pages/ArticleDetail"));
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
          <Route path="/search" element={<Search />} />
          <Route path="/results" element={<Results />} />
          <Route path="/driver/:id" element={<DriverProfile />} />
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
          <Route path="/privacy" element={<Privacy />} />
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
