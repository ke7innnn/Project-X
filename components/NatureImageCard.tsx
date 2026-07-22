import { NatureImage } from '@/types';

interface NatureImageCardProps {
  image: NatureImage;
  onSelect: (image: NatureImage) => void;
  onHover?: (image: NatureImage | null) => void;
  isSelected?: boolean;
  layoutMode?: 'moodboard' | 'standard';
}

export default function NatureImageCard({ 
  image, 
  onSelect, 
  onHover, 
  isSelected,
  layoutMode = 'moodboard'
}: NatureImageCardProps) {
  return (
    <div 
      className={`relative group rounded-xl overflow-hidden cursor-pointer transition-all duration-300 transform hover:scale-[1.04] hover:z-20 border ${
        isSelected 
          ? 'border-cyan-400 ring-2 ring-cyan-400 ring-offset-1 ring-offset-[#02050c] shadow-[0_0_20px_rgba(0,240,255,0.5)]' 
          : 'border-white/10 hover:border-cyan-400/60 shadow-md hover:shadow-[0_0_15px_rgba(0,240,255,0.25)]'
      }`}
      onPointerEnter={() => onHover?.(image)}
      onPointerLeave={() => onHover?.(null)}
      onClick={() => onSelect(image)}
    >
      <img 
        src={image.thumbUrl} 
        alt={image.description}
        className={`w-full object-cover transition-transform duration-500 group-hover:scale-110 ${
          layoutMode === 'moodboard' ? 'h-28 sm:h-32 aspect-square' : 'h-44 object-cover'
        }`}
        loading="lazy"
      />
      
      {/* Dark gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 z-10">
        <p className="text-[9px] text-zinc-300 mb-1 truncate font-mono">Photo by {image.photographer}</p>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onSelect(image);
          }}
          className={`w-full font-bold py-1 px-2 rounded text-[10px] tracking-wider uppercase transition-all font-mono ${
            isSelected 
              ? 'bg-cyan-400 text-black shadow-[0_0_8px_#00f0ff]' 
              : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border border-cyan-400/40'
          }`}
        >
          {isSelected ? '★ Selected' : 'Select'}
        </button>
      </div>

      {/* Selected Indicator Badge */}
      {isSelected && (
        <div className="absolute top-1.5 right-1.5 bg-cyan-400 text-black text-[8px] font-extrabold px-1.5 py-0.5 rounded shadow-[0_0_8px_#00f0ff] font-mono tracking-wider z-20">
          ✓ SELECTED
        </div>
      )}
    </div>
  );
}

