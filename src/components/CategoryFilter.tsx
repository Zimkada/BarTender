// src/components/CategoryFilter.tsx
import { Category } from '../types';

interface CategoryFilterProps {
    categories: Category[];
    selectedCategory: string;
    onSelectCategory: (categoryId: string) => void;
    productCounts?: Record<string, number>;
}

export function CategoryFilter({
    categories,
    selectedCategory,
    onSelectCategory,
    productCounts = {}
}: CategoryFilterProps) {
    const totalProducts = Object.values(productCounts).reduce((sum, count) => sum + count, 0);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Catégories</h3>
            <div className="flex flex-wrap gap-2">
                {/* All categories button */}
                <button
                    onClick={() => onSelectCategory('all')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedCategory === 'all'
                        ? 'bg-amber-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                >
                    Tout ({totalProducts})
                </button>

                {/* Individual category buttons */}
                {categories.map((category) => (
                    <button
                        key={category.id}
                        onClick={() => onSelectCategory(category.id)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedCategory === category.id
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        {category.name} ({productCounts[category.id] || 0})
                    </button>
                ))}
            </div>
        </div>
    );
}
