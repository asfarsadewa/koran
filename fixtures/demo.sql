PRAGMA foreign_keys = ON;

INSERT INTO editions
  (id, kind, edition_date, publication_date, issue_number, masthead_dek, published_at, curator_model, is_demo)
VALUES
  ('2000-01-01', 'hari_ini', '2000-01-01', '2000-01-01', 1,
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

INSERT INTO edition_translations (edition_id, locale, masthead_dek)
VALUES (
  '2000-01-01', 'zh-Hans',
  '冲突、灾害与粮食短缺继续压迫平民生活；救援物资送抵灾区的道路日益狭窄。'
)
ON CONFLICT(edition_id, locale) DO UPDATE SET masthead_dek = excluded.masthead_dek;

INSERT INTO article_translations (article_id, locale, headline, dek, dateline, impact)
VALUES
  ('2000-01-01-1', 'zh-Hans',
   '援助通道收窄；平民粮食需求继续增加',
   '日内瓦——人道机构呼吁为粮食、饮水及药品开辟安全而稳定的通道。运输受阻使物资无法送抵所有亟需援助的地区。',
   '日内瓦',
   '流离失所家庭面对粮食、清洁饮水、住所及基本医疗照护日益短缺的局面。'),
  ('2000-01-01-2', 'zh-Hans',
   '武装冲突迫使更多家庭离开住所',
   '前线报告称，居民区安全再受威胁后，又有一批民众被迫迁离。儿童与老年人属于长途转移中处境最为艰难的群体。',
   '边境地区',
   '仓促迁离使许多家庭失去工作、学校、日常药物及当地救助网络。'),
  ('2000-01-01-3', 'zh-Hans',
   '暴雨切断交通；受困居民等待救援',
   '洪水封闭多条道路，妨碍救援人员进入与外界隔绝的居民点。有关当局要求民众远离急流并遵守疏散命令。',
   '沿海地区',
   '道路中断延误粮食运送、医疗服务与受灾居民区的电力恢复。'),
  ('2000-01-01-4', 'zh-Hans',
   '需求不断增加；医疗服务承受重压',
   '医疗机构报告称，在患者人数增加之际，人手与设备均告不足。拥挤安置点内防止传染病蔓延已成为首要事项。',
   '日内瓦',
   '服务受阻使妇幼照护、免疫接种及慢性疾病治疗被迫延后。'),
  ('2000-01-01-5', 'zh-Hans',
   '长期干旱损害收成并压缩清洁水源',
   '降雨不足导致农作物减产，并使当地水源逐渐干涸。小农户只能依靠有限储备迎接下一个农季。',
   '非洲之角',
   '农村家庭同时失去粮食与收入，妇女和儿童则须跋涉更远距离取水。'),
  ('2000-01-01-6', 'zh-Hans',
   '拘押与新闻限制引起各方关切',
   '人权观察机构要求公开调查多名居民遭拘押及新闻报道受限制的情况。有关人员目前处境仍缺乏完整资料。',
   '亚洲',
   '家属难以取得明确法律信息，资讯限制亦妨碍独立调查所指控的侵权行为。'),
  ('2000-01-01-7', 'zh-Hans',
   '基本食品价格上涨；贫困家庭购买力继续下降',
   '粮食与运输费用增加，而许多家庭收入未能同步上升。救援机构警告，部分家庭已经开始减少每日进食分量。',
   '拉丁美洲',
   '低收入家庭被迫降低膳食质量、延后就医，或让子女中断学业。'),
  ('2000-01-01-8', 'zh-Hans',
   '流离失所儿童失去学校与稳定保护',
   '长期迁徙使临时教室已不能满足需要。儿童保护机构要求为教育及家庭团聚提供更可靠的支援。',
   '中东',
   '失学加剧童工、早婚、剥削以及失去心理社会支持等风险。');
