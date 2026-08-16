# Juara Merdeka

**Juara Merdeka** adalah koran ikhtisar dunia dwibahasa Indonesia–Tionghoa yang dihimpun agen redaksi setiap hari. Ia hanya memuat peristiwa yang menimbulkan dampak buruk bagi manusia—perang, pertikaian, bencana, kelaparan, wabah, pelanggaran hak asasi, dan krisis kemanusiaan—dengan tautan langsung ke penerbit sumber.

Alamat produksi: [koran.r3ptil.com](https://koran.r3ptil.com)

Tampilan pembaca meniru lembar koran Indonesia era 1980-an: hitam-putih, tipografi padat, pembagian kolom keras, tekstur tinta dan kertas, tanpa rupa aplikasi web modern. Semua gambar pilihan dipaksa menjadi monokrom dengan raster halftone. Tombol `中文版` di sudut kanan atas membuka edisi Tionghoa Sederhana; pergantian dilakukan seperti penggantian acuan cetak, dengan aksara Tionghoa berangsur menggantikan huruf Latin. Tata letak dan gerak tersebut tetap terbaca di telepon genggam serta menghormati pilihan pengurangan gerak.

Lembar **Kemarin** di [`/kemarin`](https://koran.r3ptil.com/kemarin) memakai tata letak yang sama, tetapi mencetak tanggal hari kalender Perth dikurangi 35 tahun. Mesin redaksi menyusun delapan peristiwa berdampak buruk dari arsip ensiklopedia dan catatan sezaman, lalu menuliskannya seolah-olah koran itu terbit pada pagi historis itu. Kepala lembar menandai bingkai waktu; naskah berita tidak menyebut “tiga puluh lima tahun lalu”. Tombol `KEMARIN` / `HARI INI` pada kepala koran menukar kedua lembar tanpa kehilangan tanggal edisi atau bahasa.

Setiap berita mempunyai tombol **Bagikan Kliping**. Tombol ini mencetak kartu PNG 1080 × 1350 langsung di peramban dengan kepala koran, tipografi, tekstur kertas, gambar monokrom, ikhtisar, dampak, dan nama sumber yang sama dengan lembar pembaca. Agar gambar penerbit dapat dicetak ke kanvas tanpa kehilangan foto karena pembatasan lintas-asal, Worker meneruskan hanya alamat gambar yang sudah tersimpan untuk tanggal dan nomor berita tersebut; rute ini tetap memerlukan cookie pembaca, membatasi ukuran respons, dan tidak menerima alamat gambar bebas dari klien. Pada peramban seluler yang mendukung Web Share, gambar dikirim sebagai berkas bersama tautan ke edisi serta nomor berita yang tetap; tautan tersebut selalu menuju `koran.r3ptil.com`, bukan situs penerbit sumber. Apabila berbagi berkas tidak didukung, PNG diunduh dan alamat Koran disalin agar dapat dilampirkan secara manual. Edisi Tionghoa menghasilkan kliping serta tautan berbahasa Tionghoa.

Apabila alamat produksi dibagikan melalui wahana pergaulan, kepala koran, uraian ringkas, alamat kanonik, serta panji hitam-putih berukuran 1200 × 630 piksel disampaikan melalui Open Graph dan Twitter Card. Panji tersebut sengaja dapat dibaca tanpa cookie, sedangkan isi edisi dan aset pembaca tetap berada di belakang pemeriksaan Turnstile.

> **Catatan etika:** situs ini merupakan agregator. Agen tidak menulis berita seolah-olah melakukan peliputan sendiri, tidak menampilkan kekerasan secara sensasional, dan wajib menyertakan sumber asli untuk setiap judul.

## Susunan sistem

Eve dan Cloudflare mengerjakan bagian yang berbeda:

1. **Agen redaksi Eve (Node.js 24 pada Vercel)** menyusun dua lembar pada jadwal yang sama. Edisi hari ini meminta calon dari rentang kalender Brave News yang meliputi jendela redaksi, kemudian menyaring waktu terbitnya sendiri hingga tepat 36 jam. Hasil tanpa waktu terbit yang dapat dipastikan serta hasil di luar jendela ditolak. Lembar Kemarin menggeser tanggal cetak 35 tahun ke belakang dan meminta calon dari kronologi Wikipedia untuk bulan cetak dan bulan sebelumnya, halaman “hari ini dalam sejarah”, serta kedua umpan Wikimedia On This Day. Karena arsip menyimpan tanggal dan bukan detik, calon digolongkan menurut jarak hari: `exact` untuk hari cetak atau petang sebelumnya, `adjacent` untuk dua hari sebelumnya tempat jendela redaksi masih mencapainya, `ongoing` untuk rentang bertanggal yang sudah berjalan dan belum tutup pada pagi itu, dan `recent` untuk peristiwa bertanggal tunggal yang sudah lewat tanpa keterangan bahwa ia masih berlangsung. Peristiwa yang bertanggal sesudah tanggal cetak disisihkan seluruhnya supaya lembar itu tidak melaporkan apa yang belum terjadi. Setiap tautan bukti ditandai penerbit, jenisnya, apakah ia terbit sezaman dengan peristiwanya atau ditulis kemudian, dan — pertanyaan yang berlainan — apakah ia sudah terbit sebelum tanggal cetak sehingga meja redaksi pagi itu memang dapat memegangnya. Calon yang datang dari umpan on-this-day tiba tanpa rujukan sama sekali, sebab umpan itu hanya memberi ringkasan artikel; calon semacam itu dibacakan kembali daftar rujukan artikelnya, dan rujukan yang sezaman dengan pekan peristiwa dipungut serta ditandai sebagai berasal dari artikel, bukan dari baris peristiwa. Buku calon juga menyebut negeri yang mengalami pertikaian jauh di atas kelaziman negeri itu sendiri pada tanggal cetak menurut arsip peristiwa GDELT, beserta negeri mana yang tidak disebut oleh satu pun calon; arsip itu tidak memuat judul maupun tautan, sehingga ia menjadi peringatan tentang liputan yang timpang dan tidak pernah menjadi sumber. Indeksnya dibangun sekali setahun dengan `npm run gdelt:index -- 1991 1992`. Agen lalu memeriksa silang sumber dan menyusun tepat delapan berita beserta naskah Tionghoa Sederhana yang sepadan memakai OpenAI Responses API dan model `gpt-5.6-sol`. Naskah akhir ditandatangani dengan HMAC-SHA256.
2. **Cloudflare Worker** menerima naskah yang sah melalui `POST /api/editions`, memvalidasi kelengkapan kedua bahasa dengan Zod, dan menyimpan edisi secara idempoten berdasarkan tanggal.
3. **Cloudflare D1** menyimpan satu susunan sumber bersama naskah Indonesia dan Tionghoa dalam tabel terjemahan yang terkait. Setiap baris edisi mempunyai `kind` `hari_ini` atau `kemarin` dan diindeks menurut tanggal perakitan Perth; tanggal yang tercetak pada lembar Kemarin ialah hari itu dikurangi 35 tahun. Tidak ada basis data berbayar atau penyimpanan gambar milik sendiri. Edisi lama tanpa terjemahan tetap dapat dibaca, tetapi pengalih bahasa baru diaktifkan apabila delapan terjemahan tersedia seluruhnya. Alamat kliping memakai `?edisi=YYYY-MM-DD#berita-N` pada `/` atau `/kemarin` supaya berita yang dibagikan tetap membuka lembar yang sesuai setelah edisi baru terbit.
4. **Turnstile** memeriksa pembaca. Setelah Siteverify berhasil, Worker menerbitkan cookie akses `HttpOnly`, `Secure`, dan bertanda tangan selama 12 jam.
5. **Static Assets** dari Worker menampilkan edisi terkini; setiap berita merupakan tautan ke sumber eksternal.

Pemisahan ini disengaja. Vercel hanya menjalankan Eve, Vercel Workflow, dan jadwal redaksi; Cloudflare tetap menjadi rumah tunggal bagi halaman pembaca, Turnstile, API penerbitan, dan D1. Kanal HTTP Eve menolak pemanggilan umum dan hanya menerima OIDC dari proyek Vercel yang sama atau sesi pengembangan lokal. Pemanggilan Vercel Cron juga wajib membawa `Authorization: Bearer <CRON_SECRET>`; nilai secret hanya disimpan pada lingkungan produksi Vercel.

## Jadwal redaksi

`agent/schedules/edisi-pagi.md` dan `agent/schedules/edisi-kemarin.md` memakai cron yang sama:

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
npm run agent:curate:kemarin
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

Proyek Eve di Vercel memerlukan lima variabel produksi:

```dotenv
OPENAI_API_KEY="..."
BRAVE_API_KEY="..."
CRON_SECRET="..."
CLOUDFLARE_PUBLISH_URL="https://nama-worker.example"
PUBLISH_SECRET="..."
```

Hubungkan proyek dengan `eve link`, pasang kelima variabel pada lingkungan produksi Vercel, lalu jalankan `eve deploy`. Gunakan nilai acak yang berbeda untuk `CRON_SECRET` dan `PUBLISH_SECRET`. Eve menerjemahkan jadwal menjadi Vercel Cron; periksa kemunculannya pada **Settings → Cron Jobs** dan riwayatnya pada **Observability → Cron Jobs**. Pemanggilan manual yang setara adalah `npm run agent:curate`.

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
- `agent/schedules/edisi-pagi.md` — jadwal edisi hari ini pukul 07.00 WITA/AWST.
- `agent/schedules/edisi-kemarin.md` — jadwal lembar Kemarin pada jam yang sama.
- `migrations/0003_kemarin_editions.sql` — jenis lembar dan tanggal perakitan tanpa menimpa edisi lama.
- `agent/channels/eve.ts` — kebijakan OIDC yang menutup kanal agen dari pemanggilan umum.
- `agent/tools/publish_edition.ts` — kontrak penerbitan bertanda tangan.
- `agent/tools/kemarin_publication_context.ts` — tanggal cetak historis dan jendela 35 tahun.
- `agent/tools/collect_historical_candidates.ts` — buku calon dari arsip Wikipedia.
- `agent/lib/historical-window.ts` — penggolongan tanggal `exact`, `adjacent`, `ongoing`, `recent`.
- `agent/lib/historical-evidence.ts` — penerbit, jenis sumber, dan penanda sezaman atau kemudian.
- `agent/lib/gdelt-conflict.ts` — negeri yang tertekan pada tanggal cetak dan yang luput dari buku calon.
- `scripts/build-gdelt-index.mjs` — peringkas arsip GDELT setahun menjadi `agent/lib/gdelt-conflict-index.ts`.
- `src/index.ts` — router Worker, Siteverify, API, dan gerbang aset.
- `migrations/0001_initial.sql` — skema dasar D1.
- `migrations/0002_bilingual_editions.sql` — tabel naskah Tionghoa yang menjaga edisi lama tetap utuh.
- `public/styles.css` — sistem visual koran hitam-putih responsif.
- `public/language.js` — pemeriksaan ketersediaan bahasa, penanggalan, dan peralihan campuran aksara.
- `public/social/juara-merdeka-social.png` — panji Open Graph hitam-putih 1200 × 630 piksel.

## Rujukan platform

- [Eve](https://vercel.com/eve)
- [Model GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [Brave News Search API](https://api-dashboard.search.brave.com/app/documentation/news-search/get-started)
- [Cloudflare Turnstile: validasi server](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/)

## Keamanan dan lisensi

Laporkan kerentanan melalui petunjuk pada [`SECURITY.md`](SECURITY.md), bukan melalui issue publik. Repositori ini tersedia untuk pemeriksaan kode, tetapi bukan proyek sumber terbuka. Ketentuan hak cipta terdapat pada [`LICENSE`](LICENSE), dan batas kontribusi dijelaskan dalam [`CONTRIBUTING.md`](CONTRIBUTING.md).
