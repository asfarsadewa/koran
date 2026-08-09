PRAGMA foreign_keys = ON;

INSERT INTO editions
  (id, edition_date, issue_number, masthead_dek, published_at, curator_model, is_demo)
VALUES
  ('2000-01-01', '2000-01-01', 1,
   'Pertikaian, bencana, dan kekurangan pangan kembali menekan penduduk sipil; bantuan menghadapi jalan yang kian sempit.',
   '2000-01-01T23:00:00.000Z', 'gpt-5.6-sol', 1)
ON CONFLICT(id) DO UPDATE SET is_demo = 1;

DELETE FROM articles WHERE edition_id = '2000-01-01';

INSERT INTO articles
  (id, edition_id, rank, section, headline, dek, dateline, source_name, source_url, source_published_at, impact, image_url)
VALUES
  ('2000-01-01-1', '2000-01-01', 1, 'humanitarian',
   'Jalur Bantuan Menyempit; Kebutuhan Pangan Penduduk Sipil Terus Bertambah',
   'JENEWA — Badan-badan kemanusiaan menyerukan jalan masuk yang aman dan tetap bagi makanan, air, serta obat-obatan. Gangguan pengangkutan membuat persediaan tidak dapat menjangkau seluruh tempat yang memerlukannya.',
   'JENEWA', 'Kantor PBB untuk Koordinasi Urusan Kemanusiaan', 'https://www.unocha.org/', '2000-01-01',
   'Keluarga yang telah mengungsi menghadapi berkurangnya bahan makanan, air bersih, tempat berlindung, dan perawatan dasar.', NULL),
  ('2000-01-01-2', '2000-01-01', 2, 'conflict',
   'Pertikaian Bersenjata Memaksa Keluarga Meninggalkan Tempat Tinggal',
   'Laporan lapangan mencatat perpindahan penduduk baru setelah keselamatan permukiman kembali terancam. Anak-anak dan orang lanjut usia termasuk kelompok yang paling sulit menempuh perjalanan.',
   'WILAYAH PERBATASAN', 'Komite Internasional Palang Merah', 'https://www.icrc.org/en', '2000-01-01',
   'Perpindahan mendadak memisahkan keluarga dari pekerjaan, sekolah, obat rutin, dan jaringan pertolongan setempat.', NULL),
  ('2000-01-01-3', '2000-01-01', 3, 'disaster',
   'Hujan Lebat Memutus Perhubungan; Penduduk Menanti Pertolongan',
   'Banjir menutup sejumlah jalan dan menghambat petugas mencapai permukiman yang terpisah. Pihak berwenang meminta warga menghindari aliran deras serta mengikuti perintah pengungsian.',
   'KAWASAN PESISIR', 'Federasi Internasional Palang Merah dan Bulan Sabit Merah', 'https://www.ifrc.org/', '2000-01-01',
   'Jalan yang putus menahan pengiriman pangan, layanan kesehatan, dan pemulihan listrik bagi permukiman terdampak.', NULL),
  ('2000-01-01-4', '2000-01-01', 4, 'health',
   'Pelayanan Kesehatan Tertekan di Tengah Kebutuhan yang Meningkat',
   'Fasilitas kesehatan melaporkan kekurangan tenaga dan perlengkapan ketika jumlah pasien bertambah. Pencegahan penyakit menular menjadi perhatian utama di tempat penampungan yang padat.',
   'JENEWA', 'Organisasi Kesehatan Dunia', 'https://www.who.int/emergencies', '2000-01-01',
   'Gangguan layanan membuat perawatan ibu dan anak, imunisasi, serta pengobatan penyakit menahun tertunda.', NULL),
  ('2000-01-01-5', '2000-01-01', 5, 'climate',
   'Kemarau Panjang Menekan Hasil Panen dan Persediaan Air Bersih',
   'Curah hujan yang tidak mencukupi mengurangi hasil pertanian dan mengeringkan sumber air setempat. Petani kecil menghadapi musim berikutnya dengan cadangan yang terbatas.',
   'TANDUK AFRIKA', 'Organisasi Meteorologi Dunia', 'https://wmo.int/topics/extreme-weather', '2000-01-01',
   'Rumah tangga pedesaan kehilangan pangan sekaligus pendapatan, sementara perempuan dan anak menempuh jarak lebih jauh untuk memperoleh air.', NULL),
  ('2000-01-01-6', '2000-01-01', 6, 'rights',
   'Penahanan dan Pembatasan Penerangan Mengundang Keprihatinan',
   'Pemantau hak asasi meminta pemeriksaan terbuka atas penahanan sejumlah warga dan pembatasan terhadap pemberitaan. Keterangan mengenai keadaan mereka masih belum lengkap.',
   'ASIA', 'Kantor Komisaris Tinggi PBB untuk Hak Asasi Manusia', 'https://www.ohchr.org/en/press-releases', '2000-01-01',
   'Keluarga kesulitan memperoleh kepastian hukum, sedangkan pembatasan informasi menghambat pemeriksaan bebas atas dugaan pelanggaran.', NULL),
  ('2000-01-01-7', '2000-01-01', 7, 'economy',
   'Harga Bahan Pokok Naik; Daya Beli Keluarga Miskin Kian Susut',
   'Biaya pangan dan pengangkutan bertambah ketika pendapatan banyak rumah tangga tidak bergerak seimbang. Lembaga bantuan memperingatkan bahwa pengurangan jatah makan mulai dilakukan.',
   'AMERIKA LATIN', 'Program Pangan Dunia', 'https://www.wfp.org/global-hunger-crisis', '2000-01-01',
   'Keluarga berpendapatan rendah terpaksa mengurangi mutu makanan, menunda perawatan, atau menarik anak dari sekolah.', NULL),
  ('2000-01-01-8', '2000-01-01', 8, 'humanitarian',
   'Anak-Anak Pengungsi Kehilangan Sekolah dan Perlindungan Tetap',
   'Perpindahan yang berkepanjangan membuat ruang belajar darurat tidak lagi mencukupi. Lembaga perlindungan anak meminta dukungan yang lebih pasti bagi pendidikan dan penyatuan keluarga.',
   'TIMUR TENGAH', 'Dana Anak-Anak Perserikatan Bangsa-Bangsa', 'https://www.unicef.org/emergencies', '2000-01-01',
   'Putus sekolah memperbesar risiko pekerja anak, perkawinan dini, eksploitasi, dan hilangnya dukungan psikososial.', NULL);
