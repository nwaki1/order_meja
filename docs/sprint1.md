Kita akan mengembangkan Sprint 1 untuk aplikasi POS multi-tenant secara bertahap.

Tujuan akhir Sprint 1:

* admin dapat login;
* user memiliki akses ke tenant tertentu;
* tenant memiliki beberapa outlet;
* admin dapat membuat kategori produk;
* admin dapat membuat master produk;
* produk dapat memiliki harga berbeda pada setiap outlet;
* admin dapat melihat katalog produk berdasarkan outlet.

Scope yang belum boleh dibuat:

* worker;
* shift;
* target;
* payroll;
* stok;
* transaksi POS;
* cart;
* checkout;
* supplier;
* purchase order;
* transfer stok.

Aturan domain:

1. Gunakan shared schema.
2. Data master produk terhubung ke tenant.
3. Outlet memiliki ID permanen.
4. Kepemilikan outlet disimpan pada tabel outlet_ownerships agar outlet dapat berpindah tenant tanpa mengganti ID.
5. Satu outlet hanya boleh memiliki satu ownership aktif dengan valid_until null.
6. Harga jual dipisahkan ke tabel product_prices karena produk yang sama dapat memiliki harga berbeda pada setiap outlet.
7. Jangan menghapus data bisnis secara permanen. Gunakan is_active jika sesuai.
8. Ikuti pola arsitektur dan convention repository yang sudah ada. Jangan membuat arsitektur baru jika struktur existing sudah tersedia.
9. Semua migration harus dapat di-rollback.
10. Validasi tenant isolation wajib diterapkan pada service layer dan authorization layer.
11. Jangan lanjut ke mini-sprint berikutnya sebelum diminta.

Sebelum coding:

* baca struktur repository;
* identifikasi stack backend, frontend, ORM, pola migration, pola routing, pola validation, dan pola testing;
* baca tabel authentication yang sudah tersedia;
* jelaskan file yang akan dibuat atau diubah;
* sampaikan jika ada konflik dengan struktur existing.

Urutan pengerjaan:

* Sprint 1.0: foundation dan analisis repository
* Sprint 1.1: tenants dan user_tenants
* Sprint 1.2: outlets, outlet_ownerships, dan user_outlets
* Sprint 1.3: product_categories
* Sprint 1.4: products
* Sprint 1.5: product_prices
* Sprint 1.6: outlet catalog dan seed data

Kerjakan hanya mini-sprint yang saya minta.

Setelah setiap mini-sprint selesai:

* tampilkan ringkasan perubahan;
* tampilkan migration yang dibuat;
* tampilkan endpoint yang tersedia;
* tampilkan validasi penting;
* tampilkan command test;
* jalankan test jika environment memungkinkan;
* tampilkan hasil test;
* sarankan nama commit;
* berhenti dan tunggu instruksi berikutnya.
