export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-800">
      <div className="text-center px-6 py-12 max-w-4xl mx-auto">
        <div className="space-y-8">
          <h1 className="text-6xl md:text-8xl font-bold text-white mb-8 tracking-tight">
            THE WEBSITE IS DOWN FOR MAINTENANCE
          </h1>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
            <p className="text-2xl md:text-3xl text-gray-200 mb-6">
              We're working hard to improve your experience
            </p>
            
            <div className="text-xl md:text-2xl text-blue-300">
              Check out{' '}
              <a 
                href="https://www.congress.gov/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-4 decoration-2 transition-colors duration-200"
              >
                https://www.congress.gov/
              </a>
              {' '}in the meantime
            </div>
          </div>
          
          <div className="text-gray-400 text-lg">
            Thank you for your patience
          </div>
        </div>
      </div>
    </div>
  );
}