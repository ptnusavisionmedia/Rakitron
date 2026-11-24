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

Di **Uji gerak → Pergelangan**, penggeser **Putar telapak** memilih sudut 0° sampai 360°. Tombol **Kiri 30°** dan **Kanan 30°** dapat ditekan berulang untuk melewati 0° atau 360°. **Putar 360°** menjalankan satu putaran dari posisi sekarang dan **Hentikan putaran** menghentikannya di sudut yang terlihat. Gunakan **Tekuk pergelangan** dan **Miringkan pergelangan** untuk mengarahkan telapak. **Netralkan pergelangan** mengembalikan ketiga sudut ke 0°. Jika gerakan tertahan dekat meja, angkat lengan untuk memberi ruang. Jika telapak menyentuh lengan bawah, kurangi tekukan pergelangan atau ubah sudut siku.

Di **Uji gerak → Jari**, geser satu jari untuk mengubah tekukannya. Penggeser **Oposisi ibu jari** memutar ibu jari ke arah telunjuk. Tombol **Buka**, **Genggam**, **Cubit** dan **Tunjuk** menggerakkan jari secara bersamaan. Pilih **Lihat tangan** untuk memeriksa ruas dari dekat dan **Atur ulang kamera** untuk melihat meja.

Untuk mencoba misi dengan tangan terbuka, pilih **Lengan**. Dengan pergelangan netral, putar alas ke −130°, atur siku ke −92°, lalu bahu ke 38°. Kembali ke **Jari** dan pilih **Genggam**. Angkat bahu ke 48°, putar alas ke −40° di atas baki, lalu pilih **Buka** untuk melepas kubus.

Pada tab **Perakitan**, buka **Model acuan** untuk mengunduh model tangan dan lengan lengkap dalam format GLB. Model ini memuat empat animasi gestur dan satu demonstrasi gerak pergelangan.

## Aset dan pengujian

- `npm run assets` membuat ulang seluruh aset. Gunakan `npm run assets:hand` untuk memperbarui model tangan di `public/models/rakitron-hand.glb` beserta kedua ilustrasinya.
- `npm test` menguji urutan dan orientasi pemasangan, ketersediaan kendali, penjepitan, pelepasan, serta kondisi keberhasilan misi.
- `npm run typecheck` memeriksa TypeScript. `npm run build` membuat versi produksi.
- Proyek menggunakan Next.js App Router, React, TypeScript, Three.js, dan React Three Fiber.

## Hosting di Vercel

Proyek ini adalah Next.js dengan ekspor statis (`output: 'export'`), jadi tidak butuh environment variable atau server.

1. Push folder `rakitron` ke GitHub (folder `node_modules`, `.next`, dan `out` sudah di-ignore).
2. Di vercel.com pilih **Add New → Project**, impor repo tersebut. Jika repo berisi folder lain, set **Root Directory** ke `rakitron`.
3. Framework terdeteksi otomatis sebagai Next.js; pengaturan build ada di `vercel.json`. Klik **Deploy**.

Atau lewat CLI: `npx vercel` (preview) dan `npx vercel --prod` (produksi).

## Efek perakitan dan suara

Setiap komponen meluncur ke soket, menumbuk dengan bunyi "klik", memercikkan bintang, lalu bergetar sebentar. Tiap komponen yang terpasang menaikkan satu nada tangga nada pentatonik, sehingga enam komponen membentuk melodi kecil. Panah jingga menunjuk soket tujuan, komponen berikutnya berdenyut di meja, dan ada bunyi "tink" ketika komponen yang diseret masuk jangkauan soket. Saat robot selesai dan misi berhasil, muncul spanduk sorakan, konfeti, dan fanfare.

Pada Uji gerak, sendi berbunyi seperti servo, capit atau tangan berbunyi saat menggenggam, dan kubus berdebam ketika mendarat. Semua bunyi disintesis dengan Web Audio di `lib/sfx.ts`, tanpa berkas audio. Suara menyala secara bawaan; tombol speaker mematikannya, dan tombol not musik menyalakan lagu latar. Pilihan disimpan di browser. Efek gerak dinonaktifkan bila sistem meminta *reduced motion*.

## Gerak otomatis

Setelah robot selesai dirakit, buka **Uji gerak → Otomatis**. **Ambil dan taruh otomatis** membuat robot mengambil kubus kuning dan menaruhnya di baki biru sendiri. Di bawahnya ada empat animasi gerak untuk tiap model: capit paralel punya Kalibrasi sumbu, Pindai area kerja, Las titik, dan Semprot cat; tangan lima jari punya Uji jari berurutan, Hitung satu sampai lima, Kencangkan baut, dan Uji rentang pergelangan. Tekan program yang sedang berjalan untuk menghentikannya. Program berjalan lewat aksi yang sama dengan kontrol manual, jadi batas sendi dan tabrakan tetap berlaku. Urutannya ada di `lib/motions.ts`.
