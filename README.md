# Juara Merdeka

**Juara Merdeka** adalah koran ikhtisar dunia berbahasa Indonesia yang dihimpun agen redaksi setiap hari. Ia hanya memuat peristiwa yang menimbulkan dampak buruk bagi manusia—perang, pertikaian, bencana, kelaparan, wabah, pelanggaran hak asasi, dan krisis kemanusiaan—dengan tautan langsung ke penerbit sumber.

Alamat produksi: [koran.r3ptil.com](https://koran.r3ptil.com)

Tampilan pembaca meniru lembar koran Indonesia era 1980-an: hitam-putih, tipografi padat, pembagian kolom keras, tekstur tinta dan kertas, tanpa rupa aplikasi web modern. Semua gambar pilihan dipaksa menjadi monokrom dengan raster halftone. Tata letak tetap terbaca di telepon genggam.

Apabila alamat produksi dibagikan melalui wahana pergaulan, kepala koran, uraian ringkas, alamat kanonik, serta panji hitam-putih berukuran 1200 × 630 piksel disampaikan melalui Open Graph dan Twitter Card. Panji tersebut sengaja dapat dibaca tanpa cookie, sedangkan isi edisi dan aset pembaca tetap berada di belakang pemeriksaan Turnstile.

> **Catatan etika:** situs ini merupakan agregator. Agen tidak menulis berita seolah-olah melakukan peliputan sendiri, tidak menampilkan kekerasan secara sensasional, dan wajib menyertakan sumber asli untuk setiap judul.

## Susunan sistem

Eve dan Cloudflare mengerjakan bagian yang berbeda:

1. **Agen redaksi Eve (Node.js 24 pada Vercel)** meminta calon berita dari rentang kalender Brave News yang meliputi jendela redaksi, kemudian menyaring waktu terbitnya sendiri hingga tepat 36 jam. Hasil tanpa waktu terbit yang dapat dipastikan serta hasil di luar jendela ditolak. Agen lalu memeriksa silang sumber dan menyusun tepat delapan berita memakai OpenAI Responses API dan model `gpt-5.6-sol`. Naskah akhir ditandatangani dengan HMAC-SHA256.
2. **Cloudflare Worker** menerima naskah yang sah melalui `POST /api/editions`, memvalidasi susunan dengan Zod, dan menyimpan edisi secara idempoten berdasarkan tanggal.
3. **Cloudflare D1** menyimpan edisi dan berita. Tidak ada basis data berbayar atau penyimpanan gambar milik sendiri.
4. **Turnstile** memeriksa pembaca. Setelah Siteverify berhasil, Worker menerbitkan cookie akses `HttpOnly`, `Secure`, dan bertanda tangan selama 12 jam.
5. **Static Assets** dari Worker menampilkan edisi terkini; setiap berita merupakan tautan ke sumber eksternal.

Pemisahan ini disengaja. Vercel hanya menjalankan Eve, Vercel Workflow, dan jadwal redaksi; Cloudflare tetap menjadi rumah tunggal bagi halaman pembaca, Turnstile, API penerbitan, dan D1. Kanal HTTP Eve menolak pemanggilan umum dan hanya menerima OIDC dari proyek Vercel yang sama atau sesi pengembangan lokal.

## Jadwal redaksi

`agent/schedules/edisi-pagi.md` memakai cron berikut:

```text
0 23 * * *
```

Cron dinyatakan dalam UTC. Pukul 23.00 UTC adalah pukul **07.00 WITA/AWST** pada hari berikutnya, sepanjang tahun karena Perth tidak memakai daylight-saving time.

## Menjalankan secara lokal

Prasyarat:

- Node.js 24 atau lebih baru;
- akun OpenAI untuk menjalankan kurasi sungguhan;
- Wrangler yang sudah masuk ke akun Cloudflare untuk penerapan.

Pasang dependensi dan siapkan D1 lokal:

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run typegen
npm run d1:migrate:local
npm run d1:seed:local
npm run dev
```

Buka `http://127.0.0.1:8787`. Berkas `.dev.vars.example` memakai pasangan kunci uji Turnstile yang selalu lolos dan hanya boleh dipakai secara lokal. Edisi tanggal 1 Januari 2000 pada `fixtures/demo.sql` adalah naskah peraga tata letak, bukan berita.

Untuk mencoba agen, salin `.env.example` menjadi `.env.local`, lalu isi nilai lokal berikut tanpa memasukkannya ke Git:

```dotenv
OPENAI_API_KEY="..."
BRAVE_API_KEY="..."
CLOUDFLARE_PUBLISH_URL="http://127.0.0.1:8787"
PUBLISH_SECRET="nilai-yang-sama-dengan-.dev.vars"
```

Kemudian jalankan:

```powershell
npm run agent:info
npm run agent:curate
```

Untuk penerbitan satu kali dari komputer pengelola tanpa menyimpan secret penerbitan ke cakram, `scripts/publish-once.ps1` membuat secret sementara, memasangnya pada Worker, dan meneruskan nilai yang sama hanya ke proses Eve. Perintah ini memerlukan login Wrangler dan merotasi `PUBLISH_SECRET` setiap kali dijalankan:

```powershell
.\scripts\publish-once.ps1 -NodePath "C:\path\to\node-24\node.exe"
```

## Konfigurasi produksi

### 1. Cloudflare Worker dan D1

Worker dikonfigurasi oleh `wrangler.jsonc`. Pada penerapan pertama, Wrangler dapat menyediakan basis D1 yang dinamai `juara-merdeka`; sesudah itu jalankan migrasi jarak jauh:

```powershell
npm run deploy:worker
npm run d1:migrate:remote
```

### 2. Turnstile

Widget Turnstile **Managed** bernama `Juara Merdeka Reader Gate` dibatasi pada `koran.r3ptil.com`; site key publiknya disimpan pada `vars.TURNSTILE_SITE_KEY` di `wrangler.jsonc`. Simpan secret key hanya sebagai secret Worker:

```powershell
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Widget klien memakai action `turnstile-spin-v1`; Worker menolak verifikasi produksi dengan action lain. Jangan memakai kunci uji Cloudflare pada deployment produksi.

### 3. Secret tanda tangan

Buat dua secret acak yang berbeda dan panjang. Jangan menaruh nilainya di `wrangler.jsonc`:

```powershell
npx wrangler secret put SESSION_SECRET
npx wrangler secret put PUBLISH_SECRET
```

- `SESSION_SECRET` menandatangani cookie akses pembaca.
- `PUBLISH_SECRET` menandatangani payload dari Eve. Nilai yang sama harus tersedia pada host Eve sebagai variabel `PUBLISH_SECRET`.

Proyek Eve di Vercel memerlukan empat variabel produksi:

```dotenv
OPENAI_API_KEY="..."
BRAVE_API_KEY="..."
CLOUDFLARE_PUBLISH_URL="https://nama-worker.example"
PUBLISH_SECRET="..."
```

Hubungkan proyek dengan `eve link`, pasang keempat secret pada lingkungan produksi Vercel, lalu jalankan `eve deploy`. Eve menerjemahkan jadwal menjadi Vercel Cron; periksa kemunculannya pada **Settings → Cron Jobs** dan riwayatnya pada **Observability → Cron Jobs**. Pemanggilan manual yang setara adalah `npm run agent:curate`.

## Pemeriksaan mutu

```powershell
npm run typecheck
npm run test:coverage
npm run agent:info
npm run agent:build
npm run worker:dry-run
```

`npm run build` menjalankan seluruh rangkaian di atas. Cakupan deterministik wajib mencapai sedikitnya 90% untuk pernyataan, fungsi, dan baris serta 80% untuk cabang. Sebelum menerbitkan perubahan, uji juga halaman nyata pada ukuran desktop dan 390 px, tautan sumber, alur Turnstile, panji sosial tanpa cookie, `GET /api/health`, respons tanpa cookie pada `GET /api/edition`, serta penolakan tanda tangan penerbitan yang tidak sah.

## Berkas penting

- `agent/agent.ts` — model, batas sesi, dan alat yang diizinkan.
- `agent/instructions.md` — kebijakan kurasi, pemeriksaan fakta, dan susunan delapan berita.
- `agent/skills/gaya-redaksi.md` — pedoman bahasa Indonesia formal gaya ruang redaksi lama.
- `agent/schedules/edisi-pagi.md` — jadwal pukul 07.00 WITA/AWST.
- `agent/channels/eve.ts` — kebijakan OIDC yang menutup kanal agen dari pemanggilan umum.
- `agent/tools/publish_edition.ts` — kontrak penerbitan bertanda tangan.
- `src/index.ts` — router Worker, Siteverify, API, dan gerbang aset.
- `migrations/0001_initial.sql` — skema D1.
- `public/styles.css` — sistem visual koran hitam-putih responsif.
- `public/social/juara-merdeka-social.png` — panji Open Graph hitam-putih 1200 × 630 piksel.

## Rujukan platform

- [Eve](https://vercel.com/eve)
- [Model GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [Brave News Search API](https://api-dashboard.search.brave.com/app/documentation/news-search/get-started)
- [Cloudflare Turnstile: validasi server](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/)
