import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Account, GameState } from "../engine/types";
import {
  loadAccounts, saveAccounts, currentSession, setSession,
  loadState, saveState, clearState, hashPassword,
} from "../engine/storage";
import { ActionResult, catchUpLive, initState, uid } from "../engine/engine";

interface Ctx {
  account: Account | null;
  game: GameState | null;
  notices: string[];
  signUp(email: string, password: string, provider?: "email" | "google"): Promise<string | null>;
  signIn(email: string, password: string): Promise<string | null>;
  signInGoogle(): Promise<void>;
  signOut(): void;
  startGame(displayName: string, avatarColor: string, mode: "solo" | "live"): void;
  resetGame(): void;
  apply(fn: (prev: GameState) => ActionResult): string | undefined;
  dismissAwaySummary(): void;
  pushNotice(text: string): void;
  updateProfile(patch: Partial<Pick<GameState, "displayName" | "avatarColor" | "mode">>): void;
}

const GameCtx = createContext<Ctx>(null as unknown as Ctx);
export const useGame = () => useContext(GameCtx);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(() => {
    const id = currentSession();
    return id ? loadAccounts().find((a) => a.id === id) ?? null : null;
  });
  const [game, setGame] = useState<GameState | null>(() =>
    account ? loadState(account.id) : null
  );
  const [notices, setNotices] = useState<string[]>([]);
  const noticeTimer = useRef<number | undefined>(undefined);

  const pushNotice = useCallback((text: string) => {
    setNotices((n) => [...n.slice(-3), text]);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotices([]), 6000);
  }, []);

  // Live mode: catch up on load / account change
  useEffect(() => {
    if (account && game && game.mode === "live") {
      const today = new Date().toISOString().slice(0, 10);
      if (game.lastAdvancedDay !== today) {
        const { state } = catchUpLive(game);
        setGame(state);
        saveState(account.id, state);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  useEffect(() => {
    if (account && game) saveState(account.id, game);
  }, [account, game]);

  const signUp = useCallback(async (email: string, password: string, provider: "email" | "google" = "email") => {
    const accounts = loadAccounts();
    const norm = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(norm)) return "Enter a valid email address.";
    if (provider === "email" && password.length < 6) return "Password must be at least 6 characters.";
    if (accounts.some((a) => a.email === norm)) return "An account with this email already exists.";
    const acc: Account = {
      id: uid("acc"),
      email: norm,
      passwordHash: provider === "email" ? await hashPassword(password) : "",
      provider,
      displayName: "",
    };
    saveAccounts([...accounts, acc]);
    setSession(acc.id);
    setAccount(acc);
    setGame(null);
    return null;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const accounts = loadAccounts();
    const norm = email.trim().toLowerCase();
    const acc = accounts.find((a) => a.email === norm);
    if (!acc) return "No account found with this email.";
    if (acc.provider === "email") {
      const h = await hashPassword(password);
      if (h !== acc.passwordHash) return "Incorrect password.";
    }
    setSession(acc.id);
    setAccount(acc);
    setGame(loadState(acc.id));
    return null;
  }, []);

  const signInGoogle = useCallback(async () => {
    // Demo stand-in for OAuth: a stable local "Google" account.
    const accounts = loadAccounts();
    let acc = accounts.find((a) => a.provider === "google");
    if (!acc) {
      acc = { id: uid("acc"), email: "google.demo@dirhamy.app", passwordHash: "", provider: "google", displayName: "" };
      saveAccounts([...accounts, acc]);
    }
    setSession(acc.id);
    setAccount(acc);
    setGame(loadState(acc.id));
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    setAccount(null);
    setGame(null);
  }, []);

  const startGame = useCallback((displayName: string, avatarColor: string, mode: "solo" | "live") => {
    if (!account) return;
    const s = initState(displayName, avatarColor, mode);
    setGame(s);
    saveState(account.id, s);
  }, [account]);

  const resetGame = useCallback(() => {
    if (!account) return;
    clearState(account.id);
    setGame(null);
  }, [account]);

  const apply = useCallback(
    (fn: (prev: GameState) => ActionResult): string | undefined => {
      let error: string | undefined;
      setGame((prev) => {
        if (!prev) return prev;
        const res = fn(prev);
        if (res.error) {
          error = res.error;
          pushNotice(res.error);
          return prev;
        }
        if (res.notice) pushNotice(res.notice);
        return res.state;
      });
      return error;
    },
    [pushNotice]
  );

  const dismissAwaySummary = useCallback(() => {
    setGame((g) => (g ? { ...g, awaySummary: undefined } : g));
  }, []);

  const updateProfile = useCallback((patch: Partial<Pick<GameState, "displayName" | "avatarColor" | "mode">>) => {
    setGame((g) => (g ? { ...g, ...patch } : g));
  }, []);

  const value = useMemo(
    () => ({ account, game, notices, signUp, signIn, signInGoogle, signOut, startGame, resetGame, apply, dismissAwaySummary, pushNotice, updateProfile }),
    [account, game, notices, signUp, signIn, signInGoogle, signOut, startGame, resetGame, apply, dismissAwaySummary, pushNotice, updateProfile]
  );

  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}
