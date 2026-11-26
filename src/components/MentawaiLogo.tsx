import React from 'react';

interface MentawaiLogoProps {
  className?: string;
  size?: number;
}

/**
 * Lambang Resmi Pemerintah Kabupaten Kepulauan Mentawai
 * Menampilkan semboyan "Musara Kasimaeru"
 * Menggunakan aset resmi: /assets/aistudio/Logo_Mentawai_5ae4cefd.jpg
 */
export const MentawaiLogo: React.FC<MentawaiLogoProps> = ({ 
  className = "w-10 h-12", 
  size 
}) => {
  return (
    <img
      src="/assets/aistudio/Logo_Mentawai_5ae4cefd.jpg"
      alt="Lambang Pemerintah Kabupaten Kepulauan Mentawai"
      className={`object-contain drop-shadow-md select-none pointer-events-none ${className}`}
      style={size ? { width: size, height: 'auto' } : undefined}
      loading="eager"
    />
  );
};
