"use client";

import { useSyncExternalStore } from "react";

const MAX_POINTS = 24;
const store = new Map<string, number[]>();
let listeners: Array<() => void> = [];
let snapshot = 0;

function notify() {
  snapshot++;
  for (const fn of listeners) fn();
}

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function getSnapshot() {
  return snapshot;
}

const seeded = new Set<string>();

function seedHistory(tokenId: string, currentPrice: number) {
  if (seeded.has(tokenId)) return;
  seeded.add(tokenId);

  const points: number[] = [];
  const SEED_COUNT = 16;
  const trend = (Math.random() - 0.48) * 0.001;
  const vol = currentPrice * 0.0015;
  let price = currentPrice * (1 - trend * SEED_COUNT * 0.5);
  for (let i = 0; i < SEED_COUNT; i++) {
    price += trend * currentPrice + (Math.random() - 0.5) * vol * 2;
    price = Math.max(currentPrice * 0.97, Math.min(currentPrice * 1.03, price));
    points.push(price);
  }
  points.push(currentPrice);
  store.set(tokenId, points);
}

export function pushPrices(prices: Record<string, { price: number }>) {
  let changed = false;
  for (const [tokenId, data] of Object.entries(prices)) {
    const price = data.price;
    if (!price || price <= 0 || !Number.isFinite(price)) continue;
    seedHistory(tokenId, price);
    const history = store.get(tokenId) ?? [];
    const lastPrice = history[history.length - 1];
    if (lastPrice !== undefined && lastPrice === price) continue;
    history.push(price);
    if (history.length > MAX_POINTS) history.splice(0, history.length - MAX_POINTS);
    store.set(tokenId, history);
    changed = true;
  }
  if (changed) notify();
}

export function usePriceHistoryFor(tokenId: string): number[] {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return store.get(tokenId) ?? [];
}
