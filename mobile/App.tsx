import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import ConfettiCannon from 'react-native-confetti-cannon';
import MapView, { Marker, Polyline } from 'react-native-maps';
import {
  isHealthDataAvailableAsync,
  queryQuantitySamples,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';

declare const process: {
  env: {
    EXPO_PUBLIC_EUCALYPTUS_SERVER_URL?: string;
    EXPO_PUBLIC_EUCALYPTUS_INGEST_TOKEN?: string;
  };
};

const RANGE_KEY = 'eucalyptus.range';
const SERVER_URL = process.env.EXPO_PUBLIC_EUCALYPTUS_SERVER_URL ?? '';
const INGEST_TOKEN = process.env.EXPO_PUBLIC_EUCALYPTUS_INGEST_TOKEN ?? '';
const DECISIONS_URL = SERVER_URL.replace(/\/api\/ingest\/?$/, '/api/worker-decisions');

type WorkerDecision = {
  id: string;
  name: string;
  reason: string;
  decision: string | null;
  modality: string | null;
  intensity: string | null;
  status: string | null;
  triggerTimestamp: string | null;
};

type Range = '1d' | '1w' | '1m';

const RANGE_LABELS: Record<Range, string> = {
  '1d': '1 day',
  '1w': '1 week',
  '1m': '1 month',
};

const RANGE_MS: Record<Range, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
};

const QUANTITY_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierDistanceCycling',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKQuantityTypeIdentifierAppleStandTime',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierOxygenSaturation',
] as const;

const C = {
  bg: '#F4F8EE',
  card: '#FFFFFF',
  primary: '#6E9568',
  primaryLight: '#9BBE94',
  primaryDark: '#4F7549',
  primarySoft: '#DCEAD3',
  text: '#2A3825',
  muted: '#7E8B79',
  divider: '#E4ECDE',
  inputBg: '#F9FBF5',
  dotOn: '#6E9568',
  dotOff: '#C8CFC2',
};

const SF = {
  latitude: 37.7649,
  longitude: -122.4500,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
};

const STATIC_WORKOUT_THRESHOLD_METERS = 100;
const ROUTE_MAX_POINTS = 200;

type LatLng = { latitude: number; longitude: number };
type RouteItem = { kind: 'route'; id: string; coords: LatLng[] };
type PinItem = { kind: 'pin'; id: string; coord: LatLng };
type MapItem = RouteItem | PinItem;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function workoutToMapItem(locs: LatLng[], id: string): MapItem | null {
  if (locs.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const l of locs) {
    if (l.latitude < minLat) minLat = l.latitude;
    if (l.latitude > maxLat) maxLat = l.latitude;
    if (l.longitude < minLon) minLon = l.longitude;
    if (l.longitude > maxLon) maxLon = l.longitude;
  }
  const diagonal = haversineMeters(minLat, minLon, maxLat, maxLon);
  if (diagonal < STATIC_WORKOUT_THRESHOLD_METERS) {
    let sumLat = 0;
    let sumLon = 0;
    for (const l of locs) {
      sumLat += l.latitude;
      sumLon += l.longitude;
    }
    return {
      kind: 'pin',
      id,
      coord: { latitude: sumLat / locs.length, longitude: sumLon / locs.length },
    };
  }
  const stride = Math.max(1, Math.floor(locs.length / ROUTE_MAX_POINTS));
  const coords: LatLng[] = [];
  for (let i = 0; i < locs.length; i += stride) coords.push(locs[i]);
  const last = locs[locs.length - 1];
  if (coords[coords.length - 1] !== last) coords.push(last);
  return { kind: 'route', id, coords };
}


export default function App() {
  const [range, setRange] = useState<Range>('1d');
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const breathing = useRef(new Animated.Value(1)).current;
  const pressed = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<ConfettiCannon | null>(null);

  const fireConfetti = () => {
    confettiRef.current?.start();
  };

  const [mapLoading, setMapLoading] = useState(false);
  const [mapItems, setMapItems] = useState<MapItem[]>([]);
  const [decisions, setDecisions] = useState<WorkerDecision[]>([]);
  const [boardWidth, setBoardWidth] = useState(0);
  const [boardPage, setBoardPage] = useState(0);
  const boardScrollRef = useRef<ScrollView | null>(null);
  const boardWidthRef = useRef(0);
  const boardPageRef = useRef(0);

  useEffect(() => {
    boardWidthRef.current = boardWidth;
  }, [boardWidth]);
  useEffect(() => {
    boardPageRef.current = boardPage;
  }, [boardPage]);

  const goToPage = (page: 0 | 1) => {
    const w = boardWidthRef.current;
    if (w <= 0) return;
    boardScrollRef.current?.scrollTo({ x: page * w, animated: true });
    setBoardPage(page);
  };

  const swipeToDecisions = () => goToPage(1);

  const indicatorPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_e, g) => {
        const w = boardWidthRef.current;
        const page = boardPageRef.current;
        if (w <= 0) return;
        if (g.dx < -40 && page === 0) {
          boardScrollRef.current?.scrollTo({ x: w, animated: true });
          setBoardPage(1);
        } else if (g.dx > 40 && page === 1) {
          boardScrollRef.current?.scrollTo({ x: 0, animated: true });
          setBoardPage(0);
        }
      },
    }),
  ).current;

  const loadDecisions = async () => {
    if (!DECISIONS_URL) return;
    try {
      const headers: Record<string, string> = {};
      if (INGEST_TOKEN) headers.Authorization = `Bearer ${INGEST_TOKEN}`;
      const res = await fetch(`${DECISIONS_URL}?limit=3`, { headers });
      if (!res.ok) {
        appendLog(`decisions load failed: HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      setDecisions(Array.isArray(json?.decisions) ? json.decisions : []);
    } catch (e: any) {
      appendLog(`decisions load failed: ${e?.message ?? String(e)}`);
    }
  };

  const dismissDecision = async (id: string) => {
    setDecisions((prev) => prev.filter((d) => d.id !== id));
    if (!DECISIONS_URL) return;
    try {
      const headers: Record<string, string> = {};
      if (INGEST_TOKEN) headers.Authorization = `Bearer ${INGEST_TOKEN}`;
      const res = await fetch(`${DECISIONS_URL}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) appendLog(`dismiss failed: HTTP ${res.status}`);
    } catch (e: any) {
      appendLog(`dismiss failed: ${e?.message ?? String(e)}`);
    }
  };

  const loadMapItems = async () => {
    setMapLoading(true);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      const filter = { date: { startDate: from, endDate: to } } as const;
      const workouts = await queryWorkoutSamples({
        limit: -1,
        filter,
        ascending: true,
      } as any);

      const items: MapItem[] = [];
      for (const w of workouts as readonly any[]) {
        try {
          if (typeof w?.getWorkoutRoutes !== 'function') continue;
          const routes = (await w.getWorkoutRoutes()) ?? [];
          const locs: LatLng[] = [];
          for (const route of routes) {
            for (const loc of route?.locations ?? []) {
              if (
                typeof loc?.latitude === 'number' &&
                typeof loc?.longitude === 'number'
              ) {
                locs.push({ latitude: loc.latitude, longitude: loc.longitude });
              }
            }
          }
          const id = String(w?.uuid ?? items.length);
          const item = workoutToMapItem(locs, id);
          if (item) items.push(item);
        } catch {
          // skip
        }
      }
      setMapItems(items);
    } catch (e: any) {
      appendLog(`map load failed: ${e?.message ?? String(e)}`);
      setMapItems([]);
    } finally {
      setMapLoading(false);
    }
  };

  useEffect(() => {
    if (syncing) {
      spin.setValue(0);
      const loop = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 1100,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [syncing, spin]);

  useEffect(() => {
    if (syncing) {
      breathing.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathing, {
          toValue: 1.025,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathing, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [syncing, breathing]);

  const onPressIn = () => {
    Animated.spring(pressed, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 60,
      bounciness: 4,
    }).start();
  };
  const onPressOut = () => {
    Animated.spring(pressed, {
      toValue: 1,
      useNativeDriver: true,
      speed: 25,
      bounciness: 10,
    }).start();
  };

  const appendLog = (msg: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...prev].slice(0, 50));

  useEffect(() => {
    (async () => {
      const savedRange = await AsyncStorage.getItem(RANGE_KEY);
      if (savedRange === '1d' || savedRange === '1w' || savedRange === '1m') {
        setRange(savedRange);
      }

      try {
        const available = await isHealthDataAvailableAsync();
        if (!available) {
          appendLog('HealthKit not available on this device');
          setAuthorized(false);
          return;
        }
        const ok = await requestAuthorization({
          toRead: [
            ...QUANTITY_TYPES,
            'HKWorkoutTypeIdentifier',
            'HKWorkoutRouteTypeIdentifier',
          ],
        } as any);
        setAuthorized(ok);
        if (!ok) appendLog('auth request returned false');
        if (ok) {
          loadMapItems();
          loadDecisions();
        }
      } catch (e: any) {
        appendLog(`auth error: ${e?.message ?? String(e)}`);
        setAuthorized(false);
      }
    })();
  }, []);

  const persist = async (key: string, value: string) => {
    await AsyncStorage.setItem(key, value);
  };

  const sync = async () => {
    if (!SERVER_URL) {
      appendLog('EXPO_PUBLIC_EUCALYPTUS_SERVER_URL is not set');
      return;
    }
    setSyncing(true);
    appendLog(`syncing last ${RANGE_LABELS[range]}…`);

    const to = new Date();
    const from = new Date(to.getTime() - RANGE_MS[range]);
    const filter = { date: { startDate: from, endDate: to } } as const;

    try {
      const metrics: Record<string, unknown[]> = {};
      for (const id of QUANTITY_TYPES) {
        try {
          const samples = await queryQuantitySamples(id as any, {
            limit: -1,
            filter,
            ascending: true,
          } as any);
          metrics[id] = (samples as readonly any[]).map((s) => ({
            start: s.startDate,
            end: s.endDate,
            value: s.quantity,
            unit: s.unit,
            uuid: s.uuid,
            source: s.sourceRevision?.source?.name,
          }));
        } catch (e: any) {
          metrics[id] = [];
          appendLog(`skip ${id}: ${e?.message ?? String(e)}`);
        }
      }

      const rawWorkouts = await queryWorkoutSamples({
        limit: -1,
        filter,
        ascending: true,
      } as any);

      const workouts = await Promise.all(
        (rawWorkouts as readonly any[]).map(async (w) => {
          const base = typeof w?.toJSON === 'function' ? w.toJSON() : { ...w };
          let routes: unknown[] = [];
          try {
            if (typeof w?.getWorkoutRoutes === 'function') {
              const fetched = await w.getWorkoutRoutes();
              routes = (fetched ?? []).map((r: any) => ({
                locations: (r.locations ?? []).map((loc: any) => ({
                  date: loc.date,
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  altitude: loc.altitude,
                  speed: loc.speed,
                  course: loc.course,
                  horizontalAccuracy: loc.horizontalAccuracy,
                  verticalAccuracy: loc.verticalAccuracy,
                })),
              }));
            }
          } catch (e: any) {
            appendLog(`route fetch skipped: ${e?.message ?? String(e)}`);
          }
          const typeId = (base as any).workoutActivityType;
          return {
            ...base,
            workoutActivityTypeName:
              (WorkoutActivityType as Record<number, string>)[typeId] ?? String(typeId),
            routes,
          };
        }),
      );

      const payload = {
        source: 'eucalyptus-mobile',
        exported_at: new Date().toISOString(),
        window: { from: from.toISOString(), to: to.toISOString() },
        metrics,
        workouts,
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (INGEST_TOKEN) headers.Authorization = `Bearer ${INGEST_TOKEN}`;

      const res = await fetch(SERVER_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        appendLog('synced');
        fireConfetti();
        loadMapItems();
        await loadDecisions();
        swipeToDecisions();
      } else {
        appendLog(`sync failed: HTTP ${res.status}`);
      }
    } catch (e: any) {
      appendLog(`sync failed: ${e?.message ?? String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const lastLine = log[0];
  const buttonDisabled = syncing || authorized === false;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <View style={styles.miniIconWrap}>
              <Image source={require('./assets/icon.png')} style={styles.miniIcon} />
            </View>
            <Text style={styles.miniTitle}>Eucalyptus</Text>
          </View>
          <View style={styles.statusPill}>
            <View
              style={[
                styles.dot,
                { backgroundColor: authorized ? C.dotOn : C.dotOff },
              ]}
            />
            <Text style={styles.statusPillText}>
              {authorized === null
                ? 'Initializing…'
                : authorized
                ? 'HealthKit ready'
                : 'HealthKit unavailable'}
            </Text>
          </View>
        </View>

        <View
          style={styles.boardWrap}
          onLayout={(e) => setBoardWidth(e.nativeEvent.layout.width)}
        >
          {boardWidth > 0 ? (
            <ScrollView
              ref={boardScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const p = Math.round(
                  e.nativeEvent.contentOffset.x / boardWidth,
                );
                setBoardPage(p);
              }}
            >
              <View style={{ width: boardWidth, height: '100%' }}>
                <MapView
                  style={styles.map}
                  mapType="mutedStandard"
                  initialRegion={SF}
                  showsCompass={false}
                  showsPointsOfInterest={false}
                  showsBuildings={false}
                  showsTraffic={false}
                  showsIndoors={false}
                >
                  {mapItems.map((item) =>
                    item.kind === 'route' ? (
                      <Polyline
                        key={item.id}
                        coordinates={item.coords}
                        strokeColor={C.primaryDark}
                        strokeWidth={4}
                        lineCap="round"
                        lineJoin="round"
                      />
                    ) : (
                      <Marker
                        key={item.id}
                        coordinate={item.coord}
                        anchor={{ x: 0.5, y: 0.5 }}
                      >
                        <View style={styles.tackOuter}>
                          <View style={styles.tackInner} />
                        </View>
                      </Marker>
                    ),
                  )}
                </MapView>
                {mapLoading ? (
                  <View style={styles.mapOverlay} pointerEvents="none">
                    <Text style={styles.mapOverlayText}>Loading routes…</Text>
                  </View>
                ) : mapItems.length === 0 && authorized ? (
                  <View style={styles.mapOverlay} pointerEvents="none">
                    <Text style={styles.mapOverlayText}>
                      No GPS workouts in the last week
                    </Text>
                  </View>
                ) : null}
              </View>

              <View
                style={{ width: boardWidth, height: '100%', backgroundColor: '#fff' }}
              >
                {decisions.length === 0 ? (
                  <View style={styles.decisionsEmpty}>
                    <Text style={styles.decisionsEmptyTitle}>No suggestions</Text>
                    <Text style={styles.decisionsEmptySub}>
                      You're all caught up.
                    </Text>
                  </View>
                ) : (
                  <ScrollView contentContainerStyle={styles.decisionList}>
                    {decisions.map((d, i) => (
                      <View
                        key={d.id}
                        style={[
                          styles.decisionRow,
                          i < decisions.length - 1 && styles.decisionRowDivider,
                        ]}
                      >
                        <View style={styles.decisionRowMain}>
                          {d.modality || d.intensity ? (
                            <View style={styles.decisionTag}>
                              <Text style={styles.decisionTagText}>
                                {[d.modality, d.intensity]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </Text>
                            </View>
                          ) : null}
                          <Text style={styles.decisionName} numberOfLines={2}>
                            {d.name || 'Suggestion'}
                          </Text>
                          {d.reason ? (
                            <Text style={styles.decisionReason}>{d.reason}</Text>
                          ) : null}
                        </View>
                        <Pressable
                          onPress={() => dismissDecision(d.id)}
                          hitSlop={10}
                          style={({ pressed }) => [
                            styles.decisionClose,
                            pressed && styles.decisionClosePressed,
                          ]}
                        >
                          <Text style={styles.decisionCloseIcon}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.boardIndicator} {...indicatorPan.panHandlers}>
          <Pressable
            onPress={() => goToPage(0)}
            hitSlop={6}
            style={[styles.boardDot, boardPage === 0 && styles.boardDotActive]}
          />
          <Pressable
            onPress={() => goToPage(1)}
            hitSlop={6}
            style={[styles.boardDot, boardPage === 1 && styles.boardDotActive]}
          />
        </View>

        <View style={styles.bottomSection}>
          <Text style={styles.statusLine} numberOfLines={1}>
            {lastLine ?? `Will send last ${RANGE_LABELS[range]} of HealthKit data`}
          </Text>

          <View style={styles.segment}>
            {(Object.keys(RANGE_LABELS) as Range[]).map((r) => {
              const selected = r === range;
              return (
                <Pressable
                  key={r}
                  onPress={() => {
                    setRange(r);
                    persist(RANGE_KEY, r);
                  }}
                  style={[styles.segmentItem, selected && styles.segmentItemSelected]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      selected && styles.segmentTextSelected,
                    ]}
                  >
                    {RANGE_LABELS[r]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Animated.View
            style={[
              styles.syncBtnWrap,
              {
                transform: [{ scale: Animated.multiply(breathing, pressed) }],
              },
              buttonDisabled && styles.syncBtnDisabled,
            ]}
          >
            <Pressable
              onPress={sync}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              disabled={buttonDisabled}
              style={styles.syncBtnPressable}
            >
              <LinearGradient
                colors={[C.primaryLight, C.primary, C.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.syncBtn}
              >
                <View style={styles.syncBtnRow}>
                  <Animated.Text
                    style={[
                      styles.syncBtnIcon,
                      {
                        transform: [
                          {
                            rotate: spin.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0deg', '360deg'],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    ↻
                  </Animated.Text>
                  <Text style={styles.syncBtnText}>
                    {syncing ? 'Syncing…' : 'Sync now'}
                  </Text>
                </View>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </View>

      <ConfettiCannon
        ref={(r) => {
          confettiRef.current = r;
        }}
        count={200}
        origin={{ x: -10, y: 0 }}
        autoStart={false}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  topSection: {},
  bottomSection: {},

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  miniIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  miniIcon: { width: 48, height: 48, borderRadius: 12 },
  miniTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.divider,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusPillText: { fontSize: 12, color: C.muted, fontWeight: '500' },

  segment: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: C.divider,
    marginBottom: 20,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentItemSelected: { backgroundColor: C.primarySoft },
  segmentText: { fontSize: 14, color: C.muted, fontWeight: '500' },
  segmentTextSelected: { color: C.text, fontWeight: '700' },

  syncBtnWrap: {
    borderRadius: 22,
    shadowColor: C.primaryDark,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 8,
  },
  syncBtnPressable: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  syncBtn: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  syncBtnDisabled: { opacity: 0.45 },
  syncBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  syncBtnIcon: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  syncBtnText: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.12)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  statusLine: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 14,
    textAlign: 'center',
  },

  boardWrap: {
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.divider,
    backgroundColor: '#fff',
  },
  boardIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  boardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.divider,
  },
  boardDotActive: {
    backgroundColor: C.primary,
    width: 18,
  },

  decisionList: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  decisionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  decisionRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  decisionRowMain: { flex: 1 },
  decisionTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    backgroundColor: C.primarySoft,
    borderRadius: 999,
    marginBottom: 6,
  },
  decisionTagText: {
    fontSize: 10,
    color: C.primaryDark,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  },
  decisionName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    marginBottom: 3,
  },
  decisionReason: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 16,
  },
  decisionClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decisionClosePressed: { backgroundColor: C.divider },
  decisionCloseIcon: {
    fontSize: 18,
    lineHeight: 18,
    color: C.muted,
    fontWeight: '500',
    marginTop: -2,
  },
  decisionsEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  decisionsEmptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  decisionsEmptySub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 4,
  },
  map: { flex: 1 },

  tackOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(79, 117, 73, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tackInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.primaryDark,
    borderWidth: 2,
    borderColor: '#fff',
  },

  mapOverlay: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  mapOverlayText: {
    fontSize: 12,
    color: C.muted,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
