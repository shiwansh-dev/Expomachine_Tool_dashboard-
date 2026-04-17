import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ThresholdGraphProps {
  deviceNo: string | number;
  channelKey: string;
  dateShift: string;
  backendSetting: Record<string, unknown>;
  preloadedGraphData: unknown[];
  preloadedStartTime?: string | null;
  onSettingsChange: (updatedThresholds: Record<string, unknown>) => void;
}

const ThresholdGraph: React.FC<ThresholdGraphProps> = ({
  deviceNo,
  channelKey,
  dateShift,
  backendSetting,
  preloadedGraphData,
  preloadedStartTime,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<Array<{ time: string; value: number; longtime?: string }>>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgWrapperRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(720);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  const { date, shift } = useMemo(() => {
    const parts = (dateShift || '').split(' ');
    return { date: parts[0] || '', shift: parts[1] || '' };
  }, [dateShift]);

  const normalizedPreloadedPoints = useMemo(() => {
    if (!Array.isArray(preloadedGraphData) || preloadedGraphData.length === 0) {
      return [];
    }

    const parseNumericValue = (raw: unknown): number | null => {
      if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : null;
      }
      if (typeof raw === 'string') {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (raw && typeof raw === 'object') {
        const wrapped = raw as Record<string, unknown>;
        const stringValue =
          typeof wrapped.$numberDouble === 'string'
            ? wrapped.$numberDouble
            : typeof wrapped.$numberInt === 'string'
              ? wrapped.$numberInt
              : typeof wrapped.$numberLong === 'string'
                ? wrapped.$numberLong
                : null;

        if (stringValue !== null) {
          const parsed = Number(stringValue);
          return Number.isFinite(parsed) ? parsed : null;
        }
      }
      return null;
    };

    const formatBucketTime = (minutesOffset: number) => {
      const [startHoursRaw, startMinutesRaw] = (preloadedStartTime || '00:00').split(':');
      const startHours = parseInt(startHoursRaw || '0', 10) || 0;
      const startMinutes = parseInt(startMinutesRaw || '0', 10) || 0;
      const startOffsetMinutes = startHours * 60 + startMinutes;
      const safeMinutes = Math.max(0, Math.round(minutesOffset));
      const totalMinutes = startOffsetMinutes + safeMinutes;
      const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };

    return preloadedGraphData.flatMap((item) => {
      if (Array.isArray(item) && item.length >= 2) {
        const minutesOffset = Number(item[0]);
        const value = parseNumericValue(item[1]);
        if (!Number.isFinite(minutesOffset) || value === null) {
          return [];
        }
        return [{
          time: formatBucketTime(minutesOffset),
          value,
          longtime: `${minutesOffset} min`
        }];
      }

      if (!item || typeof item !== 'object') {
        return [];
      }

      const point = item as Record<string, unknown>;
      const rawTime = typeof point.time === 'string' ? point.time : null;
      const rawValue = parseNumericValue(point.value) ?? parseNumericValue(point[channelKey]);

      if (!rawTime || rawValue === null || !Number.isFinite(rawValue)) {
        return [];
      }

      return [{
        time: rawTime,
        value: rawValue,
        longtime: typeof point.longtime === 'string' ? point.longtime : rawTime
      }];
    });
  }, [preloadedGraphData, channelKey, preloadedStartTime]);

  useEffect(() => {
    const load = async () => {
      if (normalizedPreloadedPoints.length > 0) {
        setError(null);
        setLoading(false);
        setPoints(normalizedPreloadedPoints);
        return;
      }

      setError(null);
      setLoading(true);
      try {
        const dNo = typeof deviceNo === 'string' ? parseInt(deviceNo, 10) : deviceNo;
        if (!dNo || !channelKey || !date || !shift) {
          setPoints([]);
          setLoading(false);
          return;
        }

        const resp = await fetch(`/api/factory-genie/live-status/device-data?deviceNo=${dNo}&channel=${encodeURIComponent(channelKey)}&date=${encodeURIComponent(date)}&shift=${encodeURIComponent(shift)}`);
        const json = await resp.json();
        if (!resp.ok) {
          setError(json?.error || 'Failed to load data');
          setPoints([]);
        } else {
          setPoints(Array.isArray(json.points) ? json.points : []);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
        setPoints([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [deviceNo, channelKey, date, shift, normalizedPreloadedPoints]);

  useEffect(() => {
    const el = svgWrapperRef.current;
    if (!el) return;
    const measure = () => {
      const width = Math.max(280, el.clientWidth);
      setContainerWidth(width);
      setIsMobile(window.innerWidth <= 768);
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener('resize', measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const svgData = useMemo(() => {
    if (!points.length) return null;
    const width = containerWidth;
    const height = isMobile ? 280 : 320;
    const padding = isMobile ? 35 : 40;
    const values = points.map((p) => p.value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = maxV - minV || 1;
    const xStep = (width - padding * 2) / Math.max(1, points.length - 1);

    const toX = (i: number) => padding + i * xStep;
    const toY = (v: number) => height - padding - ((v - minV) / range) * (height - padding * 2);

    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(2)} ${toY(p.value).toFixed(2)}`)
      .join(' ');

    const dArea = `M ${toX(0)} ${toY(points[0].value)} ${points
      .map((p, i) => `L ${toX(i)} ${toY(p.value)}`)
      .join(' ')} L ${toX(points.length - 1)} ${height - padding} L ${toX(0)} ${height - padding} Z`;

    const sampleEvery = Math.ceil(points.length / 6);
    const xTicks = points.map((p, i) => (i % sampleEvery === 0 ? { i, label: p.time } : null)).filter(Boolean) as Array<{ i: number; label: string }>;
    const yTicks = [minV, minV + range / 2, maxV];

    const thresholds = {
      onThreshold: backendSetting?.ON_Threshold ? (backendSetting.ON_Threshold as number) : null,
      lowThreshold: backendSetting?.LOW_Effeciency_Threshold ? (backendSetting.LOW_Effeciency_Threshold as number) : null,
      peakValue: backendSetting?.Peak_value ? (backendSetting.Peak_value as number) : null
    };

    return { width, height, padding, minV, maxV, d, dArea, xTicks, yTicks, toX, toY, xStep, thresholds };
  }, [points, containerWidth, backendSetting, isMobile]);

  const getSvgXFromClientX = useCallback((clientX: number, rect: DOMRect) => {
    if (!svgData) {
      return 0;
    }

    const relativeX = ((clientX - rect.left) / Math.max(rect.width, 1)) * svgData.width;
    return Math.max(svgData.padding, Math.min(svgData.width - svgData.padding, relativeX));
  }, [svgData]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgData || !svgWrapperRef.current) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const constrainedX = getSvgXFromClientX(e.clientX, rect);
    const idx = Math.round((constrainedX - svgData.padding) / svgData.xStep);
    const clamped = Math.max(0, Math.min(points.length - 1, idx));
    setHoverIdx(Number.isFinite(clamped) ? clamped : null);
    setHoverX(constrainedX);
  }, [getSvgXFromClientX, points.length, svgData]);

  const handleMouseLeave = useCallback(() => {
    setHoverIdx(null);
    setHoverX(null);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (!svgData || !svgWrapperRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const constrainedX = getSvgXFromClientX(touch.clientX, rect);
    const idx = Math.round((constrainedX - svgData.padding) / svgData.xStep);
    const clamped = Math.max(0, Math.min(points.length - 1, idx));
    setHoverIdx(Number.isFinite(clamped) ? clamped : null);
    setHoverX(constrainedX);
  }, [getSvgXFromClientX, points.length, svgData]);

  const handleTouchEnd = useCallback(() => {
    setTimeout(() => {
      setHoverIdx(null);
      setHoverX(null);
    }, 2000);
  }, []);

  return (
    <div className="threshold-graph-container">
      <h3 style={{ fontSize: isMobile ? '1rem' : '1.25rem', marginBottom: isMobile ? '12px' : '16px' }}>
        Current Graph for {channelKey}
      </h3>

      {loading && (
        <div className="graph-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220 }}>
          <div className="loadingSpinner" style={{ width: 28, height: 28, borderRadius: '9999px', border: '3px solid #d1d5db', borderTopColor: '#2563eb', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin {to {transform: rotate(360deg);}}`}</style>
        </div>
      )}
      {error && (
        <div className="graph-placeholder"><p style={{ color: '#f87171' }}>{error}</p></div>
      )}

      {!loading && !error && svgData && (
        <div ref={svgWrapperRef} style={{ width: '100%', position: 'relative' }}>
          <div style={{
            display: 'flex',
            gap: isMobile ? '8px' : '16px',
            marginBottom: isMobile ? '8px' : '12px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            fontSize: isMobile ? '10px' : '12px',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'flex-start' : 'center',
            padding: isMobile ? '0 8px' : '0'
          }}>
            {svgData.thresholds.onThreshold !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '6px' }}>
                <div style={{ width: isMobile ? '14px' : '16px', height: '2px', backgroundColor: '#10b981', borderTop: '2px dashed #10b981', flexShrink: 0 }}></div>
                <span style={{ color: '#10b981', fontWeight: '600', whiteSpace: 'nowrap' }}>
                  {isMobile ? 'ON' : 'ON Threshold'}: {svgData.thresholds.onThreshold}
                </span>
              </div>
            )}
            {svgData.thresholds.lowThreshold !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '6px' }}>
                <div style={{ width: isMobile ? '14px' : '16px', height: '2px', backgroundColor: '#f59e0b', borderTop: '2px dashed #f59e0b', flexShrink: 0 }}></div>
                <span style={{ color: '#f59e0b', fontWeight: '600', whiteSpace: 'nowrap' }}>
                  {isMobile ? 'LOW' : 'LOW Threshold'}: {svgData.thresholds.lowThreshold}
                </span>
              </div>
            )}
            {svgData.thresholds.peakValue !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '6px' }}>
                <div style={{ width: isMobile ? '14px' : '16px', height: '2px', backgroundColor: '#ef4444', borderTop: '2px dashed #ef4444', flexShrink: 0 }}></div>
                <span style={{ color: '#ef4444', fontWeight: '600', whiteSpace: 'nowrap' }}>
                  {isMobile ? 'Peak' : 'Peak Value'}: {svgData.thresholds.peakValue}
                </span>
              </div>
            )}
          </div>
          <svg
            width={svgData.width}
            height={svgData.height}
            viewBox={`0 0 ${svgData.width} ${svgData.height}`}
            preserveAspectRatio="none"
            style={{ background: 'transparent', width: '100%', touchAction: 'none' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <defs>
              <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {svgData.yTicks.map((t, idx) => (
              <g key={idx}>
                <line x1={svgData.padding} x2={svgData.width - svgData.padding} y1={svgData.toY(t)} y2={svgData.toY(t)} stroke="#e5e7eb" strokeDasharray="4 4" />
                <text x={svgData.padding - 8} y={svgData.toY(t) + 4} textAnchor="end" fontSize={isMobile ? "9" : "10"} fill="#6b7280">
                  {t.toFixed(0)}
                </text>
              </g>
            ))}

            {svgData.xTicks.map((tick, idx) => (
              <text key={idx} x={svgData.toX(tick.i)} y={svgData.height - svgData.padding + 16} textAnchor="middle" fontSize={isMobile ? "9" : "10"} fill="#6b7280">
                {tick.label}
              </text>
            ))}

            {svgData.thresholds.onThreshold !== null && (
              <line
                x1={svgData.padding}
                x2={svgData.width - svgData.padding}
                y1={svgData.toY(svgData.thresholds.onThreshold)}
                y2={svgData.toY(svgData.thresholds.onThreshold)}
                stroke="#10b981"
                strokeDasharray="8 4"
                strokeWidth="2"
              />
            )}
            {svgData.thresholds.lowThreshold !== null && (
              <line
                x1={svgData.padding}
                x2={svgData.width - svgData.padding}
                y1={svgData.toY(svgData.thresholds.lowThreshold)}
                y2={svgData.toY(svgData.thresholds.lowThreshold)}
                stroke="#f59e0b"
                strokeDasharray="8 4"
                strokeWidth="2"
              />
            )}
            {svgData.thresholds.peakValue !== null && (
              <line
                x1={svgData.padding}
                x2={svgData.width - svgData.padding}
                y1={svgData.toY(svgData.thresholds.peakValue)}
                y2={svgData.toY(svgData.thresholds.peakValue)}
                stroke="#ef4444"
                strokeDasharray="8 4"
                strokeWidth="2"
              />
            )}

            <path d={svgData.dArea} fill="url(#areaFill)" />
            <path d={svgData.d} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

            {hoverIdx !== null && points[hoverIdx] && (
              <>
                <line
                  x1={hoverX !== null ? hoverX : svgData.toX(hoverIdx)}
                  x2={hoverX !== null ? hoverX : svgData.toX(hoverIdx)}
                  y1={svgData.padding}
                  y2={svgData.height - svgData.padding}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                />
                <circle cx={svgData.toX(hoverIdx)} cy={svgData.toY(points[hoverIdx].value)} r={5} fill="#2563eb" stroke="#fff" strokeWidth={2} />
                <g transform={`translate(${Math.min(svgData.width - 150, Math.max(8, svgData.toX(hoverIdx) - 70))}, ${Math.max(8, svgData.toY(points[hoverIdx].value) - 54)})`}>
                  <rect x={0} y={0} rx={8} ry={8} width={150} height={44} fill="#111827" opacity={0.92} />
                  <text x={12} y={18} fontSize={11} fill="#e5e7eb">Time: {points[hoverIdx].time}</text>
                  <text x={12} y={34} fontSize={11} fill="#93c5fd">Value: {points[hoverIdx].value}</text>
                </g>
              </>
            )}
          </svg>
        </div>
      )}

      {!loading && !error && !svgData && (
        <div className="graph-placeholder">
          <p>No graph points available for the selected machine/shift.</p>
        </div>
      )}
    </div>
  );
};

export default ThresholdGraph;
