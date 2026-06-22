export default function LoadingIndicator() {
  return (
    <div className="flex space-x-1 p-3 glass rounded-xl w-16 justify-center">
      <div className="w-2 h-2 bg-[#FFB000] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-2 h-2 bg-[#FFB000] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-2 h-2 bg-[#FFB000] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}
