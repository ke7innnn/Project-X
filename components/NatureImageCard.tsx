import { NatureImage } from '@/types';

interface NatureImageCardProps {
  image: NatureImage;
  onSelect: (image: NatureImage) => void;
  onHover?: (image: NatureImage | null) => void;
  isSelected?: boolean;
}

export default function NatureImageCard({ image, onSelect, onHover, isSelected }: NatureImageCardProps) {
  return (
    <div 
      className={`relative group rounded-xl overflow-hidden cursor-pointer transition-all duration-300 ${
        isSelected ? 'ring-2 ring-[#FFB000] ring-offset-2 ring-offset-[#0A0E1A]' : 'hover:ring-1 hover:ring-gray-500'
      }`}
      onPointerEnter={() => onHover?.(image)}
      onPointerLeave={() => onHover?.(null)}
    >
      <img 
        src={image.thumbUrl} 
        alt={image.description}
        className="w-full h-48 object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
        <p className="text-xs text-gray-300 mb-2 truncate">Photo by {image.photographer} on Pexels</p>
        <button 
          onClick={() => onSelect(image)}
          className="w-full bg-[#FFB000] hover:bg-[#D8B78D] text-black font-semibold py-1.5 px-3 rounded text-sm transition-colors"
        >
          Select
        </button>
      </div>
      {isSelected && (
        <div className="absolute top-2 right-2 bg-[#FFB000] text-black text-xs font-bold px-2 py-1 rounded">
          Selected
        </div>
      )}
    </div>
  );
}
