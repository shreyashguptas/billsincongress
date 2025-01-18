import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

interface Quote {
    text: string;
    author: string;
}

const quotes: Quote[] = [
    {
        text: "Information is the currency of democracy.",
        author: "Thomas Jefferson"
    },
    {
        text: "Whenever the people are well-informed, they can be trusted with their government, for whenever things go so far wrong as to attract their notice, they can be relied on to set things right.",
        author: "Thomas Jefferson"
    },
    {
        text: "We are not afraid to entrust the American people with unpleasant facts, foreign ideas, alien philosophies, and competitive values. For a nation that is afraid to let its people judge the truth and falsehood in an open market is a nation that is afraid of its people.",
        author: "John F. Kennedy"
    },
    {
        text: "When information which properly belongs to the public is systematically withheld by those in power, the people soon become ignorant of their own affairs, distrustful of those who manage them, and — eventually — incapable of determining their own destinies.",
        author: "Richard Nixon"
    },
    {
        text: "A popular Government without popular information or the means of acquiring it, is but a Prologue to a Farce or a Tragedy or perhaps both. Knowledge will forever govern ignorance, and a people who mean to be their own Governors, must arm themselves with the power knowledge gives.",
        author: "James Madison"
    },
    {
        text: "Liberty cannot be preserved without a general knowledge among the people, who have a right, from the frame of their nature, to knowledge.",
        author: "John Adams"
    },
    {
        text: "Democracies die behind closed doors. The First Amendment, through a free press, protects the people's right to know that their government acts fairly, lawfully, and accurately.",
        author: "Judge Damon Keith"
    },
    {
        text: "A fundamental premise of American democratic theory is that government exists to serve the people. Public records are one portal through which the people observe their government, ensuring its accountability, integrity, and equity while minimizing sovereign mischief and malfeasance.",
        author: "Sandra Day O'Connor"
    }
];

export default function QuoteCarousel() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [direction, setDirection] = useState(1);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        if (isPaused) return;
        
        const timer = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % quotes.length);
            setDirection(1);
        }, 5000);

        return () => clearInterval(timer);
    }, [isPaused]);

    const goToPrevious = () => {
        setDirection(-1);
        setCurrentIndex((prevIndex) => (prevIndex - 1 + quotes.length) % quotes.length);
    };

    const goToNext = () => {
        setDirection(1);
        setCurrentIndex((prevIndex) => (prevIndex + 1) % quotes.length);
    };

    const togglePause = () => {
        setIsPaused(!isPaused);
    };

    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 1000 : -1000,
            opacity: 0
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? 1000 : -1000,
            opacity: 0
        })
    };

    return (
        <div className="w-full bg-white py-8 overflow-hidden relative">
            <div className="container max-w-6xl mx-auto px-4 relative">
                {/* Navigation Arrows */}
                <button 
                    onClick={goToPrevious}
                    className="absolute left-2 sm:left-4 lg:left-8 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 transition-colors z-10"
                    aria-label="Previous quote"
                >
                    <ChevronLeft className="w-8 sm:w-10 lg:w-12 h-8 sm:h-10 lg:h-12" />
                </button>
                
                <button 
                    onClick={goToNext}
                    className="absolute right-2 sm:right-4 lg:right-8 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 transition-colors z-10"
                    aria-label="Next quote"
                >
                    <ChevronRight className="w-8 sm:w-10 lg:w-12 h-8 sm:h-10 lg:h-12" />
                </button>

                <div className="max-w-4xl mx-auto px-8 sm:px-12 lg:px-16">
                    <div className="h-[140px] flex items-center justify-center">
                        <AnimatePresence initial={false} mode="wait" custom={direction}>
                            <motion.div
                                key={currentIndex}
                                custom={direction}
                                variants={variants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{
                                    x: { type: "spring", stiffness: 300, damping: 30 },
                                    opacity: { duration: 0.2 }
                                }}
                                className="flex flex-col items-center text-center absolute"
                            >
                                <p className="text-black text-lg md:text-xl mb-3 italic max-w-3xl">
                                    "{quotes[currentIndex].text}"
                                </p>
                                <p className="text-gray-600 text-sm md:text-base">
                                    By {quotes[currentIndex].author}
                                </p>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Pause/Play Button */}
                    <button 
                        onClick={togglePause}
                        className="absolute bottom-0 right-2 sm:right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors z-10 rounded-full border-2 border-gray-400 hover:border-gray-600 w-10 h-10 flex items-center justify-center"
                        aria-label={isPaused ? "Play" : "Pause"}
                    >
                        {isPaused ? (
                            <Play className="w-5 h-5" />
                        ) : (
                            <Pause className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
} 