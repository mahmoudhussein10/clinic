import sharp from "sharp";
await Promise.all([
  sharp("public/clinic-logo.png").resize(192,192).png().toFile("public/icon-192.png"),
  sharp("public/clinic-logo.png").resize(512,512).png().toFile("public/icon-512.png"),
  sharp("public/clinic-logo.png").resize(96,96).grayscale().png().toFile("public/badge-96.png"),
]);
