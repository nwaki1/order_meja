# DashCore Theme Plan

Dokumen ini adalah rencana implementasi jika tampilan admin `frontend-admin` ingin diarahkan ke style seperti referensi gambar: clean, white-first, soft border, rounded surfaces, sidebar kiri yang tenang, topbar tipis, dan data table yang terasa ringan.

## Target Visual

- Nuansa utama: minimal, premium, terang, rapi, banyak ruang kosong.
- Warna utama: dominan putih, abu muda, teks hitam/abu gelap.
- Komponen aksi utama: tombol hitam solid dengan teks putih.
- Komponen sekunder: putih dengan border tipis dan hover abu lembut.
- Table: card besar dengan border halus, row hover ringan, badge status sederhana.
- Sidebar: icon + label, active state abu muda, footer profile card sederhana.
- Topbar: tipis, bersih, tanpa search bar, fokus ke judul workspace, breadcrumb, dan action ringan.

## Prinsip Implementasi

- Gunakan design token dulu, bukan styling per halaman.
- Semua warna, radius, border, shadow, dan spacing penting harus lewat CSS variables.
- Komponen UI dasar menjadi sumber kebenaran: `button`, `input`, `label`, `field`, `dropdown-menu`, `sidebar`, `card`, `table wrapper`.
- Light dan dark mode tetap didukung, tetapi visual default diarahkan ke light mode seperti referensi.
- Hindari hardcode warna langsung di halaman route kecuali untuk kasus sangat spesifik.

## File yang Paling Terdampak

- [src/styles.css](/d:/Projects/sportiva/frontend-admin/src/styles.css)
- [src/routes/__root.tsx](/d:/Projects/sportiva/frontend-admin/src/routes/__root.tsx)
- [src/components/app-sidebar.tsx](/d:/Projects/sportiva/frontend-admin/src/components/app-sidebar.tsx)
- [src/components/ui/sidebar.tsx](/d:/Projects/sportiva/frontend-admin/src/components/ui/sidebar.tsx)
- [src/components/ui/button.tsx](/d:/Projects/sportiva/frontend-admin/src/components/ui/button.tsx)
- [src/components/ui/input.tsx](/d:/Projects/sportiva/frontend-admin/src/components/ui/input.tsx)
- [src/routes/users/index.tsx](/d:/Projects/sportiva/frontend-admin/src/routes/users/index.tsx)

## Fase Implementasi

### 1. Foundation Tokens

Tujuan:
- Menyamakan bahasa visual global sebelum menyentuh layout.

Pekerjaan:
- Rapikan token warna di `styles.css`.
- Tambahkan token khusus untuk:
  - background app
  - surface/card
  - soft border
  - muted text
  - sidebar active
  - primary black button
  - neutral white button
  - table header
  - row hover
  - badge active/inactive
- Standarkan radius:
  - `--radius-sm`
  - `--radius-md`
  - `--radius-lg`
  - `--radius-xl`
- Definisikan shadow yang tipis dan konsisten untuk card serta floating control.

Output:
- Semua komponen bisa ambil style dari token yang sama.

### 2. App Shell Layout

Tujuan:
- Membentuk kerangka dashboard seperti gambar: sidebar kiri, topbar kanan, content area luas.

Pekerjaan:
- Update `__root.tsx` untuk memastikan:
  - topbar lebih tipis dan bersih
  - area content punya padding desktop yang nyaman
  - background halaman konsisten putih/abu sangat muda
- Pastikan `SidebarInset` dan area utama punya pemisahan yang halus.
- Kurangi efek visual lama yang terlalu dekoratif jika masih ada gradient atau glass effect yang kuat.

Output:
- Struktur global dashboard langsung terasa seperti admin panel modern.

### 3. Sidebar Theme

Tujuan:
- Sidebar menyerupai referensi: bersih, vertikal, active item soft gray, icon sederhana.

Pekerjaan:
- Rework `app-sidebar.tsx`:
  - logo lebih sederhana
  - teks brand lebih clean
  - item menu diberi spacing lebih longgar
  - footer profile dibuat lebih minimal
- Rework variant di `ui/sidebar.tsx`:
  - active background abu muda
  - hover state lembut
  - icon color konsisten
  - border kanan atau separator halus bila diperlukan
- Pastikan mode collapse masih rapi.

Output:
- Sidebar lebih tenang dan lebih dekat ke referensi gambar.

### 4. Topbar Theme

Tujuan:
- Menyediakan topbar yang ringan tanpa search field, dengan fokus pada identitas halaman dan action area.

Pekerjaan:
- Tambah pola topbar yang reusable:
  - page title area
  - breadcrumb
  - quick actions
  - notification slot
- Bila diperlukan, pisahkan menjadi komponen baru, misalnya `admin-topbar.tsx`.
- Samakan ritme tinggi, spacing, dan alignment antara title block dan action button/icon.
- Gunakan whitespace dan divider halus agar topbar tetap hidup walau tanpa search.

Output:
- Header halaman tidak lagi hanya judul, tetapi terasa seperti workspace admin sungguhan.

### 5. Core UI Components

Tujuan:
- Membuat komponen dasar otomatis menghasilkan style tema baru.

Pekerjaan:
- `button.tsx`
  - variant primary hitam
  - variant surface putih
  - variant ghost halus
  - state hover, focus, disabled, dark mode
- `input.tsx`
  - background putih
  - border lembut
  - placeholder abu
  - focus ring tipis
- `label.tsx`
  - warna teks lebih netral
  - spacing label ke field lebih konsisten
- `field.tsx`
  - jarak antar label, helper, error dirapikan
- `dropdown-menu.tsx`
  - permukaan putih, border lembut, shadow ringan
- `collapsible.tsx`
  - animasi dan spacing disesuaikan agar tidak terasa berat

Output:
- Setiap halaman baru otomatis mengikuti tema tanpa rewrite besar.

### 6. Data Table Pattern

Tujuan:
- Membawa halaman `Users` ke pola visual seperti gambar referensi.

Pekerjaan:
- Refactor `users/index.tsx` menjadi pola:
  - title + breadcrumb + primary action
  - data card container
  - toolbar table
  - table body
  - footer pagination
- Tambahkan wrapper visual untuk table:
  - rounded large card
  - table header putih/abu sangat tipis
  - row divider lembut
  - hover row ringan
- Rapikan control:
  - page size select
  - search input
  - filter button placeholder bila dibutuhkan
  - pagination pill/button
- Status badge:
  - active = dark pill
  - inactive = light gray pill

Output:
- Halaman users bisa menjadi template untuk products, orders, customers, dan reports.

### 7. Reusable Admin Page Pattern

Tujuan:
- Supaya halaman-halaman admin berikutnya tidak dibangun dari nol.

Pekerjaan:
- Buat pola komponen reusable, misalnya:
  - `AdminPageHeader`
  - `AdminCard`
  - `AdminTableToolbar`
  - `AdminPagination`
  - `StatusBadge`
- Setelah pola stabil, route lain tinggal mengikuti struktur yang sama.

Output:
- Konsistensi lebih tinggi dan maintenance lebih ringan.

### 8. Dark Mode Translation

Tujuan:
- Memastikan tema tetap punya versi dark yang baik, walau referensi visualnya light.

Pekerjaan:
- Turunkan semua token light ke pasangan dark mode.
- Jangan sekadar invert warna.
- Pertahankan hierarki:
  - background paling gelap
  - surface sedikit lebih terang
  - border tipis tapi tetap terlihat
  - teks primer tetap punya kontras tinggi
  - tombol putih tetap bisa dipakai bila memang dibutuhkan

Output:
- Tema tetap elegan di dark mode dan tidak bentrok dengan style light.

### 9. QA dan Finishing

Tujuan:
- Menjaga tema baru stabil dan tidak hanya bagus di screenshot.

Pekerjaan:
- Cek desktop dan mobile.
- Cek sidebar collapse.
- Cek focus state keyboard.
- Cek contrast teks, badge, dan placeholder.
- Cek semua state:
  - hover
  - active
  - selected
  - disabled
  - loading
  - empty state
  - error state

Output:
- Tema siap dipakai lintas halaman, bukan hanya untuk demo.

## Urutan Eksekusi yang Disarankan

1. Rapikan token di `styles.css`.
2. Finalkan variant dasar di `button.tsx` dan `input.tsx`.
3. Sesuaikan shell layout di `__root.tsx`.
4. Rework sidebar di `app-sidebar.tsx` dan `ui/sidebar.tsx`.
5. Bentuk pola topbar reusable tanpa search bar.
6. Refactor `users/index.tsx` sampai sangat dekat ke referensi.
7. Ekstrak pola reusable dari halaman users.
8. Terapkan ke route admin lain.
9. Poles dark mode dan responsive behavior.

## Risiko yang Perlu Dijaga

- Style lama masih bercampur dengan token baru sehingga hasilnya setengah lama setengah baru.
- Terlalu banyak class inline di route bisa membuat tema sulit dirawat.
- Dark mode bisa rusak jika token tidak dipetakan sejak awal.
- Komponen sidebar dan table bisa terlihat benar di desktop tetapi pecah di mode collapse atau layar kecil.

## Acceptance Criteria

- Halaman users secara visual terasa dekat dengan referensi.
- Button, input, sidebar, table, dan pagination punya bahasa visual yang sama.
- Warna tidak tersebar sebagai hardcode di banyak file.
- Menambah halaman admin baru cukup merakit komponen reusable yang sudah ada.
- Light dan dark mode sama-sama terbaca jelas.

## Jika Dikerjakan Bertahap

Sprint 1:
- foundation tokens
- button
- input
- shell layout

Sprint 2:
- sidebar
- topbar
- users page table pattern

Sprint 3:
- reusable admin components
- dark mode polish
- responsive + QA

## Langkah Implementasi Pertama yang Paling Masuk Akal

Mulai dari `styles.css`, `button.tsx`, `input.tsx`, lalu `users/index.tsx`.
Alasannya:
- hasil visual cepat terlihat
- risiko perubahan lebih terkendali
- tema bisa divalidasi lebih awal sebelum diterapkan ke seluruh admin
