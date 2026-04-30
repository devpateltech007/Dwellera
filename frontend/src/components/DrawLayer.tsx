"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

type Pt = [number, number];

interface Props {
  active: boolean;
  polygon: Pt[] | null;
  triggerFinish: boolean;
  onComplete: (pts: Pt[]) => void;
  onPointsChange: (n: number) => void;
}

export default function DrawLayer({ active, polygon, triggerFinish, onComplete, onPointsChange }: Props) {
  const map = useMap();
  const pointsRef = useRef<Pt[]>([]);
  const previewLineRef = useRef<L.Polyline | null>(null);
  const dotsRef = useRef<L.CircleMarker[]>([]);
  const polygonRef = useRef<L.Polygon | null>(null);

  // Show completed polygon overlay
  useEffect(() => {
    polygonRef.current?.remove();
    polygonRef.current = null;
    if (polygon && polygon.length >= 3) {
      polygonRef.current = L.polygon(polygon, {
        color: "#111",
        weight: 2,
        dashArray: "6 4",
        fillColor: "#111",
        fillOpacity: 0.08,
      }).addTo(map);
    }
    return () => { polygonRef.current?.remove(); };
  }, [polygon, map]);

  // Finish trigger from parent (Finish button)
  useEffect(() => {
    if (!triggerFinish) return;
    const pts = pointsRef.current;
    if (pts.length >= 3) {
      cleanup();
      onComplete(pts);
    }
  }, [triggerFinish]);

  // Drawing interaction
  useEffect(() => {
    if (!active) {
      cleanup();
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      return;
    }

    map.dragging.disable();
    map.scrollWheelZoom.disable();
    map.doubleClickZoom.disable();
    map.getContainer().style.cursor = "crosshair";

    const onClick = (e: L.LeafletMouseEvent) => {
      const pt: Pt = [e.latlng.lat, e.latlng.lng];
      pointsRef.current = [...pointsRef.current, pt];
      onPointsChange(pointsRef.current.length);

      const dot = L.circleMarker(pt, {
        radius: 5,
        color: "#fff",
        weight: 2,
        fillColor: "#111",
        fillOpacity: 1,
      }).addTo(map);
      dotsRef.current.push(dot);

      previewLineRef.current?.remove();
      if (pointsRef.current.length > 1) {
        previewLineRef.current = L.polyline(pointsRef.current, {
          color: "#111",
          weight: 2,
          dashArray: "6 4",
          opacity: 0.7,
        }).addTo(map);
      }
    };

    const onDblClick = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e);
      const pts = pointsRef.current.slice(0, -1);
      cleanup();
      onPointsChange(0);
      if (pts.length >= 3) onComplete(pts);
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);

    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      cleanup();
    };
  }, [active, map, onComplete, onPointsChange]);

  function cleanup() {
    previewLineRef.current?.remove();
    previewLineRef.current = null;
    dotsRef.current.forEach(d => d.remove());
    dotsRef.current = [];
    pointsRef.current = [];
    map.getContainer().style.cursor = "";
  }

  return null;
}
