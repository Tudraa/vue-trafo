<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { supabase, isSupabaseConfigured } from './lib/supabaseClient'
import { 
  Activity, 
  Thermometer, 
  Zap, 
  Cpu, 
  Clock, 
  Radio, 
  RefreshCw, 
  AlertTriangle,
  Play,
  Gauge,
  Layers,
  Timer,
  ArrowRight,
  Wifi,
  Database,
  Monitor
} from '@lucide/vue'

const telemetriList = ref([])
const connectionStatus = ref('Memuat data...')
const isConnected = ref(false)
const isLoading = ref(true)
const errorMessage = ref('')
let realtimeChannel = null

// 1. Ambil 10 data riwayat terakhir dari tabel telemetri_trafo (timestamp desc)
const fetchInitialData = async () => {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const { data, error } = await supabase
      .from('telemetri_trafo')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(10)

    const receivedTime = new Date().toISOString()

    if (error) {
      console.warn('Supabase fetch notice:', error.message)
      errorMessage.value = error.message
      if (!isSupabaseConfigured) {
        connectionStatus.value = 'Kunci Anon Supabase Belum Diatur (Mode Standby)'
      } else {
        connectionStatus.value = 'Gagal Memuat Data'
      }
      if (telemetriList.value.length === 0) {
        telemetriList.value = generateMockData(10)
      }
    } else if (data && data.length > 0) {
      telemetriList.value = data.map(item => ({
        ...item,
        _received_at: item._received_at || receivedTime
      }))
      connectionStatus.value = 'Terhubung (Realtime Aktif)'
      isConnected.value = true
    } else {
      connectionStatus.value = 'Terhubung (Tabel Kosong)'
      isConnected.value = true
      if (telemetriList.value.length === 0) {
        telemetriList.value = generateMockData(10)
      }
    }
  } catch (err) {
    console.error('Fetch exception:', err)
    errorMessage.value = err.message || 'Koneksi terputus'
    connectionStatus.value = 'Mode Standby'
    if (telemetriList.value.length === 0) {
      telemetriList.value = generateMockData(10)
    }
  } finally {
    isLoading.value = false
  }
}

// 2. Buat subscription Supabase Realtime (INSERT event)
const setupRealtimeSubscription = () => {
  try {
    realtimeChannel = supabase
      .channel('telemetri_trafo_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'telemetri_trafo' },
        (payload) => {
          const receivedTime = new Date().toISOString()
          const newRecord = {
            ...payload.new,
            _received_at: receivedTime
          }
          console.log('Paket telemetri baru diterima via Realtime:', newRecord)
          telemetriList.value.unshift(newRecord)
          if (telemetriList.value.length > 10) {
            telemetriList.value.pop()
          }
          connectionStatus.value = 'Terhubung (Realtime Aktif)'
          isConnected.value = true
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          connectionStatus.value = 'Terhubung (Realtime Aktif)'
          isConnected.value = true
        }
      })
  } catch (err) {
    console.warn('Realtime subscription error:', err)
  }
}

// 3. Simulasi Pengiriman Data ESP32 / EMQX
const simulateEsp32Packet = async () => {
  const mqttTimestamp = new Date().toISOString()
  
  const newPacket = {
    trafo_id: 'TRAFO-TR-01',
    beban_kva: parseFloat((190 + Math.random() * 50).toFixed(2)),
    suhu_oli: parseFloat((52 + Math.random() * 20).toFixed(1)),
    tegangan_r: parseFloat((218 + Math.random() * 5).toFixed(1)),
    tegangan_s: parseFloat((219 + Math.random() * 5).toFixed(1)),
    tegangan_t: parseFloat((220 + Math.random() * 5).toFixed(1)),
    arus_r: parseFloat((275 + Math.random() * 40).toFixed(1)),
    arus_s: parseFloat((280 + Math.random() * 40).toFixed(1)),
    arus_t: parseFloat((272 + Math.random() * 40).toFixed(1)),
    timestamp: mqttTimestamp
  }

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('telemetri_trafo').insert([newPacket])
      if (error) {
        console.warn('Insert Supabase gagal, menggunakan simulasi lokal:', error.message)
        pushLocalMockPacket(newPacket)
      }
    } catch (e) {
      pushLocalMockPacket(newPacket)
    }
  } else {
    pushLocalMockPacket(newPacket)
  }
}

const pushLocalMockPacket = (packet) => {
  const mqttTime = new Date(packet.timestamp).getTime()
  // Simulasi delay Supabase DB insert (40-90ms) & Web receive (15-30ms)
  const dbDelay = 40 + Math.random() * 50
  const webDelay = 15 + Math.random() * 20

  const createdAt = new Date(mqttTime + dbDelay).toISOString()
  const receivedAt = new Date(mqttTime + dbDelay + webDelay).toISOString()

  const fullPacket = {
    ...packet,
    id: Date.now(),
    created_at: createdAt,
    _received_at: receivedAt
  }

  telemetriList.value.unshift(fullPacket)
  if (telemetriList.value.length > 10) {
    telemetriList.value.pop()
  }
}

// Helper Generator Sample Data
function generateMockData(count = 10) {
  const now = Date.now()
  const list = []
  for (let i = 0; i < count; i++) {
    const mqttTimeMs = now - (i * 60000)
    const dbDelayMs = 35 + (i * 3) + Math.random() * 15
    const webDelayMs = 18 + Math.random() * 12

    const mqttIso = new Date(mqttTimeMs).toISOString()
    const dbIso = new Date(mqttTimeMs + dbDelayMs).toISOString()
    const webIso = new Date(mqttTimeMs + dbDelayMs + webDelayMs).toISOString()

    list.push({
      id: `SIM-${i+1}`,
      trafo_id: 'TRAFO-TR-01',
      beban_kva: parseFloat((210.5 - i * 1.5).toFixed(2)),
      suhu_oli: parseFloat((61.2 + (i % 3 === 0 ? 3.5 : -1.2)).toFixed(1)),
      tegangan_r: parseFloat((220.4 + (i % 2 === 0 ? 0.8 : -0.5)).toFixed(1)),
      tegangan_s: parseFloat((221.1 - (i % 2 === 0 ? 0.3 : 0.6)).toFixed(1)),
      tegangan_t: parseFloat((219.8 + (i % 3 === 0 ? 1.1 : -0.4)).toFixed(1)),
      arus_r: parseFloat((295.0 + i * 2.1).toFixed(1)),
      arus_s: parseFloat((301.2 - i * 1.8).toFixed(1)),
      arus_t: parseFloat((288.4 + i * 1.2).toFixed(1)),
      timestamp: mqttIso,
      created_at: dbIso,
      _received_at: webIso
    })
  }
  return list
}

const latestRecord = computed(() => {
  return telemetriList.value[0] || null
})

// Calculations for Microsecond / Millisecond / Second Latency
const getLatencyDetails = (item) => {
  if (!item) return { mqttToDbMs: 0, dbToWebMs: 0, totalMs: 0 }

  const mqttTime = new Date(item.timestamp).getTime()
  const dbTime = item.created_at ? new Date(item.created_at).getTime() : mqttTime
  const webTime = item._received_at ? new Date(item._received_at).getTime() : Date.now()

  const mqttToDbMs = dbTime - mqttTime
  const dbToWebMs = webTime - dbTime
  const totalMs = webTime - mqttTime

  return {
    mqttToDbMs: isNaN(mqttToDbMs) ? 0 : mqttToDbMs,
    dbToWebMs: isNaN(dbToWebMs) ? 0 : dbToWebMs,
    totalMs: isNaN(totalMs) ? 0 : totalMs
  }
}

// Format Latency with Seconds, Milliseconds, and Microseconds detail
const formatMicroseconds = (ms) => {
  if (ms === null || ms === undefined || isNaN(ms)) return '-'
  const absMs = Math.abs(ms)
  const isNegative = ms < 0
  const prefix = isNegative ? '-' : ''

  const totalUs = Math.round(absMs * 1000)

  if (absMs < 1) {
    // Kurang dari 1 ms -> Tampilkan Mikrosekon (µs)
    return `${prefix}${totalUs} µs`
  } else if (absMs < 1000) {
    // Kurang dari 1 detik -> Tampilkan Milisekon (ms) & Mikrosekon (µs)
    return `${prefix}${absMs.toFixed(2)} ms (${totalUs.toLocaleString('id-ID')} µs)`
  } else {
    // 1 detik atau lebih -> Tampilkan Detik (s), Milisekon (ms), dan Mikrosekon
    const seconds = (ms / 1000).toFixed(3)
    return `${prefix}${seconds} s (${absMs.toFixed(1)} ms)`
  }
}

const formatShortLatency = (ms) => {
  if (ms === null || ms === undefined || isNaN(ms)) return '-'
  const absMs = Math.abs(ms)
  const prefix = ms < 0 ? '-' : ''
  const totalUs = Math.round(absMs * 1000)

  if (absMs < 1) {
    return `${prefix}${totalUs} µs`
  } else if (absMs < 1000) {
    return `${prefix}${absMs.toFixed(2)} ms`
  } else {
    return `${prefix}${(ms / 1000).toFixed(3)} s`
  }
}

const latestLatency = computed(() => {
  if (!latestRecord.value) return { mqttToDbMs: 0, dbToWebMs: 0, totalMs: 0 }
  return getLatencyDetails(latestRecord.value)
})

const formatDate = (isoString) => {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    const timeStr = d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    const ms = d.getMilliseconds().toString().padStart(3, '0')
    return `${timeStr}.${ms}`
  } catch (e) {
    return isoString
  }
}

onMounted(() => {
  fetchInitialData()
  setupRealtimeSubscription()
})

// 4. Clean up channel realtime saat komponen dilepas (onUnmounted)
onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
  }
})
</script>

<template>
  <div class="dashboard-wrapper">
    <!-- Top Header Bar -->
    <header class="header-container glass-panel">
      <div class="header-branding">
        <div class="icon-pulse-box">
          <Activity class="brand-icon text-cyan" />
        </div>
        <div>
          <h1 class="header-title">IoT Trafo Telemetry & Latency Monitor</h1>
          <p class="header-subtitle">Pemantauan Realtime Telemetri & Analisis Latensi (MQTT ➔ Supabase ➔ Web)</p>
        </div>
      </div>

      <div class="header-actions">
        <!-- Live Connection Badge Indicator -->
        <div 
          class="status-badge" 
          :class="{
            'connected': connectionStatus.includes('Terhubung'),
            'loading': connectionStatus.includes('Memuat') || isLoading,
            'offline': !connectionStatus.includes('Terhubung') && !isLoading
          }"
        >
          <span class="pulse-dot"></span>
          <span>{{ connectionStatus }}</span>
        </div>

        <!-- ESP32 Simulation Trigger Button -->
        <button 
          @click="simulateEsp32Packet" 
          class="btn-simulasi"
          title="Kirim payload simulasi ESP32 baru"
        >
          <Play class="btn-icon" />
          <span>Simulasi Data ESP32</span>
        </button>

        <button 
          @click="fetchInitialData" 
          class="btn-refresh" 
          :disabled="isLoading"
          title="Refresh Data"
        >
          <RefreshCw class="btn-icon" :class="{ 'spin': isLoading }" />
        </button>
      </div>
    </header>

    <!-- Supabase Configuration Notice -->
    <div v-if="!isSupabaseConfigured" class="config-banner glass-panel">
      <AlertTriangle class="banner-icon text-amber" />
      <div class="banner-text">
        <strong>Informasi Supabase:</strong> File <code>.env</code> menggunakan Anon Key default. Kredensial aktif dapat dimasukkan di <code>.env</code>. Mode simulasi latensi realtime tetap aktif secara otomatis!
      </div>
    </div>

    <!-- Main Content Area -->
    <main class="main-content">
      <!-- Latency & Time Difference Benchmark Card (FEATURE BARU) -->
      <section v-if="latestRecord" class="latency-banner-panel glass-panel">
        <div class="latency-banner-header">
          <div class="latency-title-box">
            <Timer class="banner-icon text-cyan" />
            <h3>Analisis Selisih Waktu (Latensi Pengiriman Data)</h3>
          </div>
          <span class="latency-tag font-mono">Microsecond & Millisecond Precision</span>
        </div>

        <div class="latency-flow-grid">
          <!-- Step 1: MQTT ESP32 Packet Timestamp -->
          <div class="flow-step-box">
            <div class="step-icon-box bg-purple-glow">
              <Wifi class="step-icon text-purple" />
            </div>
            <div class="step-info">
              <span class="step-label">1. MQTT ESP32 (timestamp)</span>
              <span class="step-time font-mono">{{ formatDate(latestRecord.timestamp) }}</span>
            </div>
          </div>

          <div class="flow-arrow-box">
            <ArrowRight class="arrow-icon text-cyan" />
            <div class="delay-pill font-mono">
              <span class="delay-label">Delay Ingress DB</span>
              <strong class="delay-val text-amber">{{ formatMicroseconds(latestLatency.mqttToDbMs) }}</strong>
            </div>
          </div>

          <!-- Step 2: Supabase Postgres created_at -->
          <div class="flow-step-box">
            <div class="step-icon-box bg-blue-glow">
              <Database class="step-icon text-cyan" />
            </div>
            <div class="step-info">
              <span class="step-label">2. Supabase DB (created_at)</span>
              <span class="step-time font-mono">{{ formatDate(latestRecord.created_at) }}</span>
            </div>
          </div>

          <div class="flow-arrow-box">
            <ArrowRight class="arrow-icon text-cyan" />
            <div class="delay-pill font-mono">
              <span class="delay-label">Delay Realtime Web</span>
              <strong class="delay-val text-emerald">{{ formatMicroseconds(latestLatency.dbToWebMs) }}</strong>
            </div>
          </div>

          <!-- Step 3: Web Browser Received -->
          <div class="flow-step-box">
            <div class="step-icon-box bg-emerald-glow">
              <Monitor class="step-icon text-emerald" />
            </div>
            <div class="step-info">
              <span class="step-label">3. Client Web (received_at)</span>
              <span class="step-time font-mono">{{ formatDate(latestRecord._received_at) }}</span>
            </div>
          </div>
        </div>

        <div class="latency-summary-bar font-mono">
          <span class="summary-label">Total Latensi End-to-End (MQTT ➔ Web Dashboard):</span>
          <span class="summary-value text-cyan">{{ formatMicroseconds(latestLatency.totalMs) }}</span>
        </div>
      </section>

      <!-- Latest Overview Metrics Grid -->
      <section v-if="latestRecord" class="overview-grid">
        <!-- Trafo & Beban Card -->
        <div class="glass-panel metric-card">
          <div class="card-header">
            <span class="card-label">ID Transformator</span>
            <Cpu class="card-icon text-purple" />
          </div>
          <div class="metric-value-box">
            <span class="trafo-id-badge font-mono">{{ latestRecord.trafo_id || 'TRAFO-01' }}</span>
          </div>
          <div class="metric-footer">
            <span class="footer-label">Beban kVA Terkini</span>
            <span class="footer-value font-mono text-cyan">{{ latestRecord.beban_kva }} kVA</span>
          </div>
        </div>

        <!-- Suhu Oli Trafo Card -->
        <div class="glass-panel metric-card">
          <div class="card-header">
            <span class="card-label">Suhu Oli Trafo</span>
            <Thermometer 
              class="card-icon" 
              :class="latestRecord.suhu_oli > 70 ? 'text-rose' : (latestRecord.suhu_oli > 60 ? 'text-amber' : 'text-emerald')" 
            />
          </div>
          <div class="metric-value-box">
            <span 
              class="metric-number font-mono"
              :class="latestRecord.suhu_oli > 70 ? 'text-rose' : (latestRecord.suhu_oli > 60 ? 'text-amber' : 'text-emerald')"
            >
              {{ latestRecord.suhu_oli }}°C
            </span>
          </div>
          <div class="metric-footer">
            <span class="footer-label">Status Suhu</span>
            <span 
              class="status-pill font-mono"
              :class="latestRecord.suhu_oli > 70 ? 'pill-rose' : (latestRecord.suhu_oli > 60 ? 'pill-amber' : 'pill-emerald')"
            >
              {{ latestRecord.suhu_oli > 70 ? 'TINGGI (WARNING)' : (latestRecord.suhu_oli > 60 ? 'NORMAL-TINGGI' : 'OPTIMAL') }}
            </span>
          </div>
        </div>

        <!-- Tegangan Phase (R / S / T) Card -->
        <div class="glass-panel metric-card">
          <div class="card-header">
            <span class="card-label">Tegangan Phase (V)</span>
            <Zap class="card-icon text-cyan" />
          </div>
          <div class="phase-tri-grid font-mono">
            <div class="phase-box">
              <span class="phase-tag tag-r">R</span>
              <span class="phase-val">{{ latestRecord.tegangan_r }} V</span>
            </div>
            <div class="phase-box">
              <span class="phase-tag tag-s">S</span>
              <span class="phase-val">{{ latestRecord.tegangan_s }} V</span>
            </div>
            <div class="phase-box">
              <span class="phase-tag tag-t">T</span>
              <span class="phase-val">{{ latestRecord.tegangan_t }} V</span>
            </div>
          </div>
          <div class="metric-footer">
            <span class="footer-label">Rata-rata Tegangan</span>
            <span class="footer-value font-mono text-cyan">
              {{ ((Number(latestRecord.tegangan_r) + Number(latestRecord.tegangan_s) + Number(latestRecord.tegangan_t)) / 3).toFixed(1) }} V
            </span>
          </div>
        </div>

        <!-- Arus Phase (R / S / T) Card -->
        <div class="glass-panel metric-card">
          <div class="card-header">
            <span class="card-label">Arus Phase (A)</span>
            <Gauge class="card-icon text-amber" />
          </div>
          <div class="phase-tri-grid font-mono">
            <div class="phase-box">
              <span class="phase-tag tag-r">R</span>
              <span class="phase-val">{{ latestRecord.arus_r }} A</span>
            </div>
            <div class="phase-box">
              <span class="phase-tag tag-s">S</span>
              <span class="phase-val">{{ latestRecord.arus_s }} A</span>
            </div>
            <div class="phase-box">
              <span class="phase-tag tag-t">T</span>
              <span class="phase-val">{{ latestRecord.arus_t }} A</span>
            </div>
          </div>
          <div class="metric-footer">
            <span class="footer-label">Waktu Telemetri Terakhir</span>
            <span class="footer-value font-mono text-muted">{{ formatDate(latestRecord.timestamp) }}</span>
          </div>
        </div>
      </section>

      <!-- History Table Section (10 Riwayat Terakhir) -->
      <section class="history-section glass-panel">
        <div class="section-header">
          <div class="section-title-box">
            <Layers class="section-icon text-cyan" />
            <h2>10 Riwayat Telemetri & Tabel Komparasi Latensi</h2>
          </div>
          <span class="record-counter font-mono">Total {{ telemetriList.length }} Record Telemetri</span>
        </div>

        <!-- Data Table -->
        <div class="table-responsive">
          <table class="telemetry-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Waktu MQTT (timestamp)</th>
                <th>Waktu Supabase (created_at)</th>
                <th>Selisih MQTT ➔ Supabase</th>
                <th>Selisih Supabase ➔ Web</th>
                <th>Total E2E Latensi</th>
                <th>Beban (kVA)</th>
                <th>Suhu Oli (°C)</th>
                <th>Tegangan R/S/T (V)</th>
                <th>Arus R/S/T (A)</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="(item, index) in telemetriList" 
                :key="item.id || item.timestamp || index"
                :class="{ 'latest-row': index === 0, 'new-entry-anim': index === 0 }"
              >
                <td class="font-mono row-index">
                  <span v-if="index === 0" class="live-pill">LIVE</span>
                  <span v-else>#{{ index + 1 }}</span>
                </td>
                
                <!-- Waktu Timestamp MQTT -->
                <td class="font-mono text-muted font-size-sm">
                  <div class="time-cell">
                    <Clock class="cell-icon text-purple" />
                    <span>{{ formatDate(item.timestamp) }}</span>
                  </div>
                </td>

                <!-- Waktu Supabase DB created_at -->
                <td class="font-mono text-muted font-size-sm">
                  <div class="time-cell">
                    <Database class="cell-icon text-cyan" />
                    <span>{{ formatDate(item.created_at) }}</span>
                  </div>
                </td>

                <!-- Selisih MQTT -> Supabase -->
                <td class="font-mono">
                  <span class="latency-cell-badge badge-amber">
                    {{ formatMicroseconds(getLatencyDetails(item).mqttToDbMs) }}
                  </span>
                </td>

                <!-- Selisih Supabase -> Web -->
                <td class="font-mono">
                  <span class="latency-cell-badge badge-emerald">
                    {{ formatMicroseconds(getLatencyDetails(item).dbToWebMs) }}
                  </span>
                </td>

                <!-- Total E2E Latensi -->
                <td class="font-mono font-weight-bold">
                  <span class="latency-cell-badge badge-cyan">
                    {{ formatMicroseconds(getLatencyDetails(item).totalMs) }}
                  </span>
                </td>

                <!-- Beban kVA -->
                <td class="font-mono font-weight-bold text-cyan">
                  {{ item.beban_kva }} kVA
                </td>

                <!-- Suhu Oli -->
                <td class="font-mono">
                  <span 
                    class="temp-badge"
                    :class="item.suhu_oli > 70 ? 'badge-rose' : (item.suhu_oli > 60 ? 'badge-amber' : 'badge-emerald')"
                  >
                    {{ item.suhu_oli }} °C
                  </span>
                </td>

                <!-- Tegangan Phase -->
                <td class="font-mono">
                  <div class="phase-inline-group">
                    <span class="v-tag v-r">{{ item.tegangan_r }}</span>
                    <span class="v-tag v-s">{{ item.tegangan_s }}</span>
                    <span class="v-tag v-t">{{ item.tegangan_t }}</span>
                  </div>
                </td>

                <!-- Arus Phase -->
                <td class="font-mono">
                  <div class="phase-inline-group">
                    <span class="i-tag i-r">{{ item.arus_r }}</span>
                    <span class="i-tag i-s">{{ item.arus_s }}</span>
                    <span class="i-tag i-t">{{ item.arus_t }}</span>
                  </div>
                </td>
              </tr>

              <tr v-if="telemetriList.length === 0">
                <td colspan="10" class="empty-state">
                  <Radio class="empty-icon spin" />
                  <p>Belum ada data telemetri yang tersedia.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="footer-container">
      <p>Dashboard Monitoring IoT Trafo &copy; 2026 &bull; Precision Latency Benchmark &bull; Vite + Vue 3 + Supabase Realtime</p>
    </footer>
  </div>
</template>

<style scoped>
.dashboard-wrapper {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
}

/* Header */
.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 28px;
  flex-wrap: wrap;
  gap: 16px;
}

.header-branding {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-pulse-box {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-icon {
  width: 26px;
  height: 26px;
}

.header-title {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.header-subtitle {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Latency Banner Panel */
.latency-banner-panel {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.7) 100%);
  border: 1px solid rgba(56, 189, 248, 0.2);
}

.latency-banner-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.latency-title-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.latency-title-box h3 {
  font-size: 1.1rem;
  font-weight: 600;
}

.latency-tag {
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 9999px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: var(--accent-cyan);
}

.latency-flow-grid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.flow-step-box {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.03);
  padding: 12px 18px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  flex: 1;
  min-width: 220px;
}

.step-icon-box {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bg-purple-glow { background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.3); }
.bg-blue-glow { background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); }
.bg-emerald-glow { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); }

.step-icon {
  width: 20px;
  height: 20px;
}

.step-info {
  display: flex;
  flex-direction: column;
}

.step-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.step-time {
  font-size: 0.85rem;
  font-weight: 600;
}

.flow-arrow-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.arrow-icon {
  width: 20px;
  height: 20px;
}

.delay-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.delay-label {
  font-size: 0.65rem;
  color: var(--text-muted);
}

.delay-val {
  font-size: 0.8rem;
}

.latency-summary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px dashed rgba(56, 189, 248, 0.3);
  border-radius: 10px;
  font-size: 0.9rem;
}

.summary-value {
  font-weight: 800;
  font-size: 1.05rem;
}

/* Buttons */
.btn-simulasi {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 9999px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(3, 105, 161, 0.35);
  transition: all 0.2s ease;
}

.btn-simulasi:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(3, 105, 161, 0.5);
  background: linear-gradient(135deg, #0369a1 0%, #075985 100%);
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-refresh:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Banner */
.config-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 20px;
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.25);
  font-size: 0.875rem;
}

.banner-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.banner-text code {
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--accent-amber);
}

/* Metrics Grid */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.metric-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 160px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.card-icon {
  width: 22px;
  height: 22px;
}

.metric-value-box {
  margin: 12px 0;
}

.trafo-id-badge {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent-purple);
  background: rgba(168, 85, 247, 0.1);
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid rgba(168, 85, 247, 0.2);
}

.metric-number {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
}

.metric-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
  font-size: 0.8rem;
}

.footer-label {
  color: var(--text-muted);
}

.footer-value {
  font-weight: 600;
}

/* Status Pills */
.status-pill {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.725rem;
  font-weight: 700;
}
.pill-emerald { background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); }
.pill-amber { background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); }
.pill-rose { background: rgba(244, 63, 94, 0.15); color: var(--accent-rose); }

/* Phase Tri Grid */
.phase-tri-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 10px 0;
}

.phase-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 4px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.phase-tag {
  font-size: 0.65rem;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 3px;
}

.tag-r { background: rgba(244, 63, 94, 0.2); color: #fda4af; }
.tag-s { background: rgba(245, 158, 11, 0.2); color: #fde047; }
.tag-t { background: rgba(56, 189, 248, 0.2); color: #7dd3fc; }

.phase-val {
  font-size: 0.9rem;
  font-weight: 700;
}

/* History Section */
.history-section {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-title-box h2 {
  font-size: 1.15rem;
  font-weight: 600;
}

.section-icon {
  width: 20px;
  height: 20px;
}

.record-counter {
  font-size: 0.8rem;
  color: var(--text-muted);
}

/* Table */
.table-responsive {
  width: 100%;
  overflow-x: auto;
}

.telemetry-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.telemetry-table th {
  padding: 12px 16px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.02);
}

.telemetry-table td {
  padding: 14px 16px;
  font-size: 0.85rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.2s ease;
}

.telemetry-table tbody tr:hover td {
  background: rgba(255, 255, 255, 0.04);
}

.telemetry-table tr.latest-row td {
  background: rgba(56, 189, 248, 0.06);
}

.live-pill {
  background: var(--accent-cyan);
  color: #090d16;
  font-weight: 800;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}

.time-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cell-icon {
  width: 14px;
  height: 14px;
}

.latency-cell-badge {
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.8rem;
  display: inline-block;
  white-space: nowrap;
}

.badge-emerald { background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); }
.badge-amber { background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); }
.badge-rose { background: rgba(244, 63, 94, 0.15); color: var(--accent-rose); }
.badge-cyan { background: rgba(56, 189, 248, 0.15); color: var(--accent-cyan); }

.temp-badge {
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.8rem;
}

.phase-inline-group {
  display: flex;
  gap: 6px;
}

.v-tag, .i-tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.775rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.04);
}

.v-r, .i-r { border-left: 2px solid var(--accent-rose); }
.v-s, .i-s { border-left: 2px solid var(--accent-amber); }
.v-t, .i-t { border-left: 2px solid var(--accent-cyan); }

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

.empty-icon {
  width: 32px;
  height: 32px;
  margin-bottom: 8px;
}

/* Footer */
.footer-container {
  text-align: center;
  padding: 16px;
  font-size: 0.8rem;
  color: var(--text-muted);
}

@media (max-width: 900px) {
  .latency-flow-grid {
    flex-direction: column;
    align-items: stretch;
  }
  .flow-arrow-box {
    flex-direction: row;
    justify-content: center;
  }
  .arrow-icon {
    transform: rotate(90deg);
  }
}

@media (max-width: 768px) {
  .dashboard-wrapper {
    padding: 12px;
  }
  .header-container {
    flex-direction: column;
    align-items: flex-start;
  }
  .header-actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
