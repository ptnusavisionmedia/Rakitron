# Rakitron

Rakitron adalah bengkel lengan robot 3D berbahasa Indonesia untuk anak usia 8–12 tahun. Anak memasang enam komponen, menguji sendi yang sudah terpasang, dan memindahkan kubus kuning ke baki biru. Model, ilustrasi komponen, dan material disertakan di proyek.

## Mainkan dari paket ZIP

Ekstrak seluruh isi paket ke satu folder. Gunakan Node.js 22.13 atau lebih baru. Dari folder yang berisi `package.json`, jalankan:

```sh
npm start
```

Buka **http://127.0.0.1:3000** di browser yang mendukung WebGL 2. Folder `out/` di paket memuat hasil build sehingga simulasi dapat dijalankan tanpa mengunduh dependensi. Hentikan server dengan Ctrl+C.

## Menjalankan kode sumber

```sh
npm ci
npm run dev
```

Buka **http://localhost:3000**. Untuk membangun ulang, jalankan `npm run build`, kemudian `npm start`. Hasil ekspor statis berada di `out/`.

## Bermain

1. Pilih alas putar dari laci. Dekatkan ke dudukan atau pilih soket pasangannya. Gunakan kontrol putar untuk menyelaraskan sambungan.
2. Pasang bahu, lengan atas, siku, lengan bawah, lalu alat ujung sesuai model yang dipilih. Buka kendali untuk mencoba sendi setelah bagian yang digerakkannya terpasang.
3. Pada model capit, buka kedua rahang dan arahkan ke sisi kubus, lalu tutup dan angkat lengan. Putar alas menuju baki. Turunkan lengan dan buka capit untuk melepaskan kubus.
4. Jika kubus jatuh di luar jangkauan, gunakan **Kembalikan kubus**. Untuk meninjau sambungan, lepas komponen terakhir dan pasang kembali.

Tombol antarmuka dapat difokuskan dengan Tab dan diaktifkan dengan Enter atau Spasi. Gunakan tombol panah pada penggeser sendi. Di layar sentuh, anak juga dapat memilih komponen kemudian mengetuk soketnya.

## Tangan lima jari

Pilih **Tangan lima jari** di atas meja. Gunakan **Coba tangan terakit** untuk menguji tangan secara langsung, atau rakit keenam komponen dari laci. Saat mengganti model yang sudah lengkap, lima komponen lengan tetap terpasang dan alat ujung baru siap dipasang.

Pada tab **Pergelangan** di **Uji gerak**, gunakan **Tekuk pergelangan** untuk mengarahkan tangan ke telapak atau punggung, **Miringkan pergelangan** untuk bergerak ke sisi ibu jari atau kelingking, dan **Putar telapak** untuk memutar tangan pada sumbu panjangnya. **Netralkan pergelangan** mengembalikan ketiga sudut ke 0°. Saat membawa kubus, angkat lengan untuk memberi ruang sebelum memutar tangan.

Di **Uji gerak → Jari**, geser satu jari untuk mengubah tekukannya. Penggeser **Oposisi ibu jari** memutar ibu jari ke arah telunjuk. Tombol **Buka**, **Genggam**, **Cubit** dan **Tunjuk** menggerakkan jari secara bersamaan. Pilih **Lihat tangan** untuk memeriksa ruas dari dekat dan **Atur ulang kamera** untuk melihat meja.

Untuk mencoba misi dengan tangan terbuka, pilih **Lengan**. Dengan pergelangan netral, putar alas ke −135°, atur siku ke −92°, lalu bahu ke 37°. Kembali ke **Jari** dan pilih **Genggam**. Angkat bahu ke 45°, putar alas ke −45° di atas baki, lalu pilih **Buka** untuk melepas kubus.

Pada tab **Perakitan**, buka **Model acuan** untuk mengunduh model tangan dan lengan lengkap dalam format GLB. Model ini memuat empat animasi gestur dan satu demonstrasi gerak pergelangan.

## Aset dan pengujian

- `npm run assets` membuat ulang komponen dasar dan ilustrasi. Jalankan `npm run assets:hand` sesudahnya untuk mengekspor rakitan tangan beserta animasi jari dan pergelangan ke `public/models/rakitron-hand.glb`.
- `npm test` menguji urutan dan orientasi pemasangan, ketersediaan kendali, penjepitan, pelepasan, serta kondisi keberhasilan misi.
- `npm run typecheck` memeriksa TypeScript. `npm run build` membuat versi produksi.
- Proyek menggunakan Next.js App Router, React, TypeScript, Three.js, dan React Three Fiber.

## Hosting di Vercel

Proyek ini adalah Next.js dengan ekspor statis (`output: 'export'`), jadi tidak butuh environment variable atau server.

1. Push folder `rakitron` ke GitHub (folder `node_modules`, `.next`, dan `out` sudah di-ignore).
2. Di vercel.com pilih **Add New → Project**, impor repo tersebut. Jika repo berisi folder lain, set **Root Directory** ke `rakitron`.
3. Framework terdeteksi otomatis sebagai Next.js; pengaturan build ada di `vercel.json`. Klik **Deploy**.

Atau lewat CLI: `npx vercel` (preview) dan `npx vercel --prod` (produksi).
