import React from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { GameProvider, useGame } from "./state/GameContext";
import { Shell } from "./components/Shell";
import Landing from "./pages/Landing";
import { AuthPage, Onboarding } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Daily from "./pages/Daily";
import Investments from "./pages/Investments";
import Goals from "./pages/Goals";
import GoOut, { LocationPage } from "./pages/Shopping";
import Work, { Learn } from "./pages/Work";
import Give from "./pages/Give";
import Friends from "./pages/Friends";
import HealthCheck, { Achievements, YearInReview } from "./pages/Progress";
import Settings from "./pages/Settings";

function RequireGame({ children }: { children: React.ReactNode }) {
  const { account, game } = useGame();
  const loc = useLocation();
  if (!account) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (!game) return <Navigate to="/onboarding" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <GameProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/app" element={<RequireGame><Dashboard /></RequireGame>} />
          <Route path="/app/daily" element={<RequireGame><Daily /></RequireGame>} />
          <Route path="/app/invest" element={<RequireGame><Investments /></RequireGame>} />
          <Route path="/app/goals" element={<RequireGame><Goals /></RequireGame>} />
          <Route path="/app/shopping" element={<RequireGame><GoOut /></RequireGame>} />
          <Route path="/app/shopping/:locationId" element={<RequireGame><LocationPage /></RequireGame>} />
          <Route path="/app/work" element={<RequireGame><Work /></RequireGame>} />
          <Route path="/app/learn" element={<RequireGame><Learn /></RequireGame>} />
          <Route path="/app/give" element={<RequireGame><Give /></RequireGame>} />
          <Route path="/app/friends" element={<RequireGame><Friends /></RequireGame>} />
          <Route path="/app/health" element={<RequireGame><HealthCheck /></RequireGame>} />
          <Route path="/app/achievements" element={<RequireGame><Achievements /></RequireGame>} />
          <Route path="/app/year" element={<RequireGame><YearInReview /></RequireGame>} />
          <Route path="/app/settings" element={<RequireGame><Settings /></RequireGame>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </GameProvider>
  );
}
