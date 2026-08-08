import { Helmet } from "react-helmet-async";
import { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { ShoppingCart, Send } from "lucide-react";
import { useCart } from "../context/CartContext";
import { usePromos } from "../context/PromoContext";
import { menuItems as menuItemsApi, categories as categoriesApi } from "../lib/api";
import heroImage from "../assets/photo-1414235077428-338989a2e8c0.avif";

// ✅ Helper that checks if a dish is covered by a promo (works with populated objects)
const isItemInPromo = (promo, dishId) => {
  if (promo.scope === 'all') return true;
  if (promo.scope === 'selected' && promo.applicableItems) {
    return promo.applicableItems.some(
      (i) => (typeof i === 'string' ? i : i._id?.toString()) === dishId.toString()
    );
  }
  return false;
};

const Menu = () => {
  const location = useLocation();
  const [activeCategory, setActiveCategory] = useState("all");
  const [dishes, setDishes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToCart, openCart } = useCart();
  const { activePromos } = usePromos();

  useEffect(() => {
    const hash = decodeURIComponent(location.hash).toLowerCase();
    const category = hash.startsWith("#menu-") ? hash.replace("#menu-", "") : "all";
    setActiveCategory(category);
  }, [location.hash]);

  useEffect(() => {
    fetchCategories();
    fetchDishes();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await categoriesApi.getAll();
      const raw = Array.isArray(data) ? data : data.categories || [];
      setCategories(raw.map((cat) => ({
        ...cat,
        id: cat._id || cat.id,
      })));
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  };

  const fetchDishes = async () => {
    setLoading(true);
    try {
      const data = await menuItemsApi.getAll({ available: true });
      const items = Array.isArray(data) ? data : data.items || [];
      setDishes(items.map((item) => ({
        id: item._id || item.id,
        name: item.name,
        description: item.description || "",
        price: Number(item.price),
        image: item.image || "https://via.placeholder.com/300x200?text=No+Image",
        category: item.category || "Uncategorized",
        categoryLower: (item.category || "uncategorized").toLowerCase(),
        available: item.available,
        // ✅ Daily Dish Stock — only dishes opted into tracking carry a
        // meaningful `remaining` count; everything else is always orderable
        // (subject only to the existing `available` toggle above).
        trackDailyStock: !!item.trackDailyStock,
        remaining: item.remaining,
      })));
    } catch (err) {
      console.error("Error fetching dishes:", err);
      setDishes([]);
    } finally {
      setLoading(false);
    }
  };

  const getPromoDetails = (dish) => {
    for (const promo of activePromos) {
      if (!isItemInPromo(promo, dish.id)) continue;

      if (promo.type === 'percentage' && promo.discountPercentage) {
        const discounted = dish.price * (1 - promo.discountPercentage / 100);
        return {
          displayPrice: `₦${Math.round(discounted).toLocaleString()}`,
          badge: `${promo.discountPercentage}% OFF`,
          originalPrice: `₦${dish.price.toLocaleString()}`,
        };
      }
      if (promo.type === 'freeDelivery') {
        return {
          displayPrice: `₦${dish.price.toLocaleString()}`,
          badge: 'Free Delivery',
        };
      }
      if (promo.type === 'buyXgetY' || promo.type === 'freeItem') {
        return {
          displayPrice: `₦${dish.price.toLocaleString()}`,
          badge: 'Special Offer',
        };
      }
    }
    return {
      displayPrice: `₦${dish.price.toLocaleString()}`,
      badge: null,
      originalPrice: null,
    };
  };

  const filteredDishes = activeCategory === "all"
    ? dishes
    : dishes.filter((dish) => dish.categoryLower === activeCategory.toLowerCase());

  const heroWords = ["Our", "Menu"];

  return (
    <>
      <Helmet>
        <title>Menu – Solohans Delicious Meals, Surulere, Lagos</title>
        <meta name="description" content="Order Nigerian meals online – jollof rice, egusi soup, ogbono soup, fried rice, amala, eba, and more. Fresh food delivery in Lagos at affordable prices." />
        <meta name="keywords" content="Solohans menu, jollof rice Lagos, shawarma Surulere, pasta delivery Lagos, burgers, desserts Lagos" />
        <link rel="canonical" href="https://www.solohansmeals.com/menu" />
        <meta property="og:title" content="Menu – Solohans Delicious Meals" />
        <meta property="og:description" content="Fresh, tasty meals from our kitchen to your doorstep." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.solohansmeals.com/menu" />
        <meta property="og:image" content="https://www.solohansmeals.com/menu-og.jpg" />
      </Helmet>

      {/* Hero */}
      <section id="menu" className="relative h-screen overflow-hidden">
        <img src={heroImage} alt="Our delicious menu" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-center px-4">
            <h1 className="text-4xl md:text-6xl font-light uppercase tracking-[4px] text-white" style={{ fontFamily: "'Playfair', serif" }}>
              {heroWords.map((word, i) => (
                <span
                  key={i}
                  className="inline-block mr-4"
                  style={{
                    animation: "heroWordIn 0.8s ease forwards",
                    animationDelay: `${0.2 + i * 0.15}s`,
                    opacity: 0,
                  }}
                >
                  {word}
                </span>
              ))}
            </h1>
            <p
              className="mt-4 text-lg md:text-xl text-[#E7D3A7] font-light tracking-wide max-w-2xl mx-auto"
              style={{ animation: "heroWordIn 0.8s ease forwards", animationDelay: "0.55s", opacity: 0 }}
            >
              Choose from fresh rice, shawarma, pasta, burgers, and sweets — made to order and delivered hot.
            </p>
            <div
              className="mt-6 w-24 h-0.5 bg-[#C62828] mx-auto"
              style={{ animation: "heroWordIn 0.8s ease forwards", animationDelay: "0.7s", opacity: 0 }}
            />
          </div>
        </div>
        <style>{`
          @keyframes heroWordIn {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </section>

      {/* Category Filter */}
      <section className="bg-[#FFF8F0] pt-12 pb-8 md:pt-16 md:pb-12">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex justify-center mb-6">
            <Link
              to="/order-meal"
              className="inline-flex items-center gap-2 bg-[#C62828] text-white px-6 py-3 rounded-full font-semibold uppercase tracking-wide text-sm hover:bg-[#B71C1C] transition-colors"
            >
              🍚 Build Your Meal (Jollof / Fried Rice / Spaghetti)
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setActiveCategory("all")}
              className={`px-5 py-2.5 rounded-full text-sm font-semibold uppercase tracking-wide transition-all duration-300 ${
                activeCategory === "all"
                  ? "bg-[#C62828] text-white shadow-md"
                  : "bg-white text-[#222222] border border-gray-200 hover:border-[#C62828] hover:text-[#C62828]"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.name.toLowerCase())}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold uppercase tracking-wide transition-all duration-300 ${
                  activeCategory === cat.name.toLowerCase()
                    ? "bg-[#C62828] text-white shadow-md"
                    : "bg-white text-[#222222] border border-gray-200 hover:border-[#C62828] hover:text-[#C62828]"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div className="sr-only">
            <span id="menu-all" />
            {categories.map((cat) => (
              <span id={`menu-${cat.name.toLowerCase()}`} key={cat.id} />
            ))}
          </div>
        </div>
      </section>

      {/* Dishes Grid */}
      <section className="bg-[#FFF8F0] py-8 md:py-16">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          {loading ? (
            <div className="text-center py-20 text-gray-500">Loading dishes…</div>
          ) : filteredDishes.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[#444] text-lg">No dishes found in this category.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredDishes.map((dish) => {
                const promo = getPromoDetails(dish);
                const outOfStock = dish.trackDailyStock && (dish.remaining ?? 0) <= 0;
                return (
                  <div key={dish.id} className="group bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-500">
                    <div className="h-56 overflow-hidden relative">
                      <img src={dish.image} alt={dish.name} className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${outOfStock ? 'grayscale opacity-60' : ''}`} />
                      {promo.badge && !outOfStock && (
                        <span className="absolute top-3 left-3 bg-[#C62828] text-white text-xs font-bold px-2 py-1 rounded-full shadow-md">
                          {promo.badge}
                        </span>
                      )}
                      {outOfStock && (
                        <span className="absolute top-3 left-3 bg-gray-800 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md uppercase tracking-wide">
                          Out of Stock
                        </span>
                      )}
                    </div>
                    <div className="p-6">
                      <h3 className="text-xl font-bold text-[#222222] mb-2" style={{ fontFamily: "'Playfair', serif" }}>{dish.name}</h3>
                      <p className="text-[#444] text-sm leading-relaxed mb-4">{dish.description}</p>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-[#C62828]">{promo.displayPrice}</span>
                          {promo.originalPrice && (
                            <span className="text-sm text-gray-400 line-through">{promo.originalPrice}</span>
                          )}
                        </div>
                        {outOfStock ? (
                          <div className="flex flex-col gap-2">
                            <span className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-gray-100 text-gray-500 text-sm font-semibold cursor-not-allowed">
                              Out of Stock — Sold Out for Today
                            </span>
                            <p className="text-xs text-gray-400 text-center">Check back tomorrow, or explore other dishes on the menu.</p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3">
                            <button
                              onClick={() => addToCart(dish)}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[#C62828] text-white text-sm font-semibold hover:bg-[#B71C1C] transition-colors"
                            >
                              <ShoppingCart size={16} />
                              Order Now
                            </button>
                            <button
                              onClick={() => { addToCart(dish); openCart('whatsapp'); }}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-[#C62828] text-[#C62828] text-sm font-semibold hover:bg-[#C62828] hover:text-white transition-colors"
                            >
                              <Send size={16} />
                              Order on WhatsApp
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default Menu;