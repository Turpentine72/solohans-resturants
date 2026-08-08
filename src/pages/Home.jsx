import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Leaf,
  ChefHat,
  Truck,
  HeartHandshake,
  Star,
  ShoppingCart,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import { usePromos } from "../context/PromoContext";
import { menuItems as menuItemsApi, categories as categoriesApi, reviews as reviewsApi } from "../lib/api";
import AnimatedHeading from "../component/AnimatedHeading";

// ✅ Helper that checks if a dish is in a promo’s applicable items (works with populated objects)
const isItemInPromo = (promo, dishId) => {
  if (promo.scope === 'all') return true;
  if (promo.scope === 'selected' && promo.applicableItems) {
    return promo.applicableItems.some(
      (i) => (typeof i === 'string' ? i : i._id?.toString()) === dishId.toString()
    );
  }
  return false;
};

export default function Home() {
  const { addToCart } = useCart();
  const { activePromos } = usePromos();
  const [dishes, setDishes] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    fetchDishes();
    fetchCategories();
  }, []);

  const fetchDishes = async () => {
    try {
      const data = await menuItemsApi.getSignature();
      const items = Array.isArray(data) ? data : data.items || [];
      setDishes(items.map((item) => ({
        id: item._id || item.id,
        name: item.name,
        description: item.description || "",
        price: Number(item.price),
        image: item.image || "https://via.placeholder.com/300x200?text=No+Image",
        trackDailyStock: !!item.trackDailyStock,
        remaining: item.remaining,
      })));
    } catch (err) {
      console.error("Error fetching signature dishes:", err);
    }
  };

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

  const heroSlides = [
    {
      image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?fm=jpg&fit=crop&w=1920&q=80",
      heading: "FRESH & TASTY MEALS DAILY",
      showButton: false,
    },
    {
      image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?fm=jpg&fit=crop&w=1920&q=80",
      heading: "ORDER YOUR FAVORITE FOOD FAST",
      showButton: true,
      buttonText: "ORDER NOW",
      buttonLink: "/menu",
    },
    {
      image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?fm=jpg&fit=crop&w=1920&q=80",
      heading: "HOT MEALS, FAST DELIVERY",
      showButton: false,
    },
    {
      image: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?fm=jpg&fit=crop&w=1920&q=80",
      heading: "DELICIOUS FOOD, ANYTIME YOU WANT",
      showButton: true,
      buttonText: "VIEW MENU",
      buttonLink: "/menu",
    },
  ];

  const whyFeatures = [
    { icon: <Leaf size={32} />, title: "Fresh Ingredients", description: "We use only the freshest locally-sourced produce and premium ingredients to create every meal." },
    { icon: <ChefHat size={32} />, title: "Master Chefs", description: "Our experienced chefs craft each dish with passion and precision, delivering restaurant-quality flavors." },
    { icon: <Truck size={32} />, title: "Fast Delivery", description: "Your food arrives hot and fresh, right to your doorstep – always on time, every time." },
    { icon: <HeartHandshake size={32} />, title: "Excellent Service", description: "We care about your experience. Friendly support and a satisfaction guarantee with every order." },
  ];

  function HeroCarousel() {
    const [current, setCurrent] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [touchStart, setTouchStart] = useState(null);

    const prevSlide = useCallback(() => {
      setCurrent((prev) => (prev === 0 ? heroSlides.length - 1 : prev - 1));
    }, []);

    const nextSlide = useCallback(() => {
      setCurrent((prev) => (prev === heroSlides.length - 1 ? 0 : prev + 1));
    }, []);

    const handleTouchStart = (e) => setTouchStart(e.touches[0].clientX);
    const handleTouchEnd = (e) => {
      if (touchStart === null) return;
      const touchEnd = e.changedTouches[0].clientX;
      if (touchEnd - touchStart > 50) prevSlide();
      if (touchStart - touchEnd > 50) nextSlide();
      setTouchStart(null);
    };

    useEffect(() => {
      if (isPaused) return;
      const interval = setInterval(nextSlide, 7000);
      return () => clearInterval(interval);
    }, [isPaused, nextSlide]);

    useEffect(() => {
      const handleKey = (e) => {
        if (e.key === "ArrowLeft") prevSlide();
        if (e.key === "ArrowRight") nextSlide();
      };
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }, [prevSlide, nextSlide]);

    return (
      <section
        className="relative w-full h-screen overflow-hidden bg-black"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {heroSlides.map((slide, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-all duration-1000 ease-in-out ${
              index === current ? "opacity-100 scale-100 z-20" : "opacity-0 scale-[1.25] z-0"
            }`}
          >
            <img src={slide.image} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/65" />
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center text-center px-6">
              <div className={`transition-all duration-1000 delay-300 ${index === current ? "opacity-100 translate-y-0" : "opacity-0 translate-y-20"}`}>
                <h1 className="text-3xl sm:text-4xl md:text-6xl font-light tracking-[4px] text-white uppercase" style={{ fontFamily: "'Playfair', serif" }}>
                  {slide.heading.split(" ").map((word, i) => (
                    <span
                      key={i}
                      className="inline-block mr-3 transition-all duration-700"
                      style={{
                        opacity: index === current ? 1 : 0,
                        transform: index === current ? "translateY(0)" : "translateY(24px)",
                        transitionDelay: index === current ? `${400 + i * 120}ms` : "0ms",
                      }}
                    >
                      {word}
                    </span>
                  ))}
                </h1>
                {slide.showButton && (
                  <div
                    className="transition-all duration-700"
                    style={{
                      opacity: index === current ? 1 : 0,
                      transform: index === current ? "translateY(0)" : "translateY(16px)",
                      transitionDelay: index === current ? `${400 + slide.heading.split(" ").length * 120 + 100}ms` : "0ms",
                    }}
                  >
                    <Link
                      to={slide.buttonLink}
                      className="mt-10 inline-block px-8 py-3 rounded-full bg-[#C62828] text-white uppercase tracking-[2px] text-sm font-semibold hover:bg-[#B71C1C] transition-all duration-500 shadow-lg"
                    >
                      {slide.buttonText}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex gap-2">
          {heroSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`transition-all duration-300 rounded-full ${i === current ? "w-8 h-2 bg-[#C62828]" : "w-2 h-2 bg-white/50"}`}
            />
          ))}
        </div>
      </section>
    );
  }

  function WhyChooseUsSection() {
    return (
      <section className="bg-[#FFF8F0]">
        <div className="max-w-7xl mx-auto py-16 md:py-24 px-4 md:px-6">
          <div className="text-center mb-12 md:mb-16">
            <AnimatedHeading
              text="Why Solohans?"
              tag="h2"
              className="text-3xl md:text-4xl font-light tracking-[4px] text-[#222222] uppercase"
            />
            <div className="mt-4 w-24 h-0.5 bg-[#C62828] mx-auto" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {whyFeatures.map((feature, index) => (
              <div
                key={index}
                className="group bg-white border border-[#C62828]/10 rounded-2xl p-8 text-center hover:shadow-lg hover:-translate-y-1 transition-all duration-500"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-[#C62828]/10 text-[#C62828] group-hover:bg-[#C62828] group-hover:text-white transition-colors duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-[#222222] mb-3 uppercase tracking-wide">{feature.title}</h3>
                <p className="text-[#444] leading-7 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  function DishesSection() {
    return (
      <section className="bg-white">
        <div className="max-w-7xl mx-auto py-16 md:py-24 px-4 md:px-6">
          <div className="text-center mb-12 md:mb-16">
            <AnimatedHeading
              text="Our Signature Dishes"
              tag="h2"
              className="text-3xl md:text-4xl font-light tracking-[4px] text-[#222222] uppercase"
            />
            <div className="mt-4 w-24 h-0.5 bg-[#C62828] mx-auto" />
            <p className="mt-4 text-[#444] max-w-2xl mx-auto">
              Hand-picked favourites made with the freshest ingredients, just for you.
            </p>
          </div>
          {dishes.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No signature dishes yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {dishes.map((dish) => {
                const promo = getPromoDetails(dish);
                const outOfStock = dish.trackDailyStock && (dish.remaining ?? 0) <= 0;
                return (
                  <div key={dish.id} className="group bg-[#FFF8F0] rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-500">
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
                      <h3 className="text-xl font-bold text-[#222222] mb-2">{dish.name}</h3>
                      <p className="text-[#444] text-sm leading-relaxed mb-4">{dish.description}</p>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-[#C62828]">{promo.displayPrice}</span>
                          {promo.originalPrice && (
                            <span className="text-sm text-gray-400 line-through">{promo.originalPrice}</span>
                          )}
                        </div>
                        {outOfStock ? (
                          <span className="px-4 py-2 rounded-full bg-gray-100 text-gray-500 text-sm font-semibold cursor-not-allowed">
                            Out of Stock
                          </span>
                        ) : (
                          <button
                            onClick={() => addToCart(dish)}
                            className="px-4 py-2 rounded-full bg-[#C62828] text-white text-sm font-semibold hover:bg-[#B71C1C] transition-colors"
                          >
                            Order Now
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-center mt-10">
            <Link to="/menu" className="px-6 py-3 bg-[#C62828] text-white font-semibold rounded-full hover:bg-[#B71C1C] transition-colors inline-block">
              View All Dishes
            </Link>
          </div>
        </div>
      </section>
    );
  }

  function CategoriesSection() {
    return (
      <section className="bg-[#FFF8F0]">
        <div className="max-w-7xl mx-auto py-16 md:py-24 px-4 md:px-6">
          <div className="text-center mb-12 md:mb-16">
            <AnimatedHeading
              text="Solohans Special Menu"
              tag="h2"
              className="text-3xl md:text-4xl font-light tracking-[4px] text-[#222222] uppercase"
            />
            <div className="mt-4 w-24 h-0.5 bg-[#C62828] mx-auto" />
            <p className="mt-4 text-[#444] max-w-2xl mx-auto">
              Explore our wide variety of meals – there's something for everyone.
            </p>
          </div>
          {categories.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No categories yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/menu#menu-${cat.name.toLowerCase()}`}
                  className="group relative h-64 rounded-2xl overflow-hidden shadow-md cursor-pointer block"
                >
                  <img
                    src={cat.image || "https://via.placeholder.com/300x150?text=No+Image"}
                    alt={cat.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                    <h3 className="text-2xl font-bold mb-1">{cat.name}</h3>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  function TestimonialsSection() {
    const [featuredReviews, setFeaturedReviews] = useState([]);

    useEffect(() => {
      const fetchFeatured = async () => {
        try {
          const data = await reviewsApi.getApproved();
          const all = Array.isArray(data) ? data : data.reviews || [];
          setFeaturedReviews(all.filter(r => r.featured).slice(0, 3));
        } catch (err) {
          console.error("Error fetching featured reviews:", err);
        }
      };
      fetchFeatured();
    }, []);

    const StarRating = ({ rating }) => (
      <div className="flex gap-1">
        {[...Array(5)].map((_, i) => (
          <Star key={i} size={16} className={i < rating ? "fill-[#C62828] text-[#C62828]" : "text-gray-300"} />
        ))}
      </div>
    );

    return (
      <section className="bg-white">
        <div className="max-w-7xl mx-auto py-16 md:py-24 px-4 md:px-6">
          <div className="text-center mb-12 md:mb-16">
            <AnimatedHeading
              text="What Our Customers Say"
              tag="h2"
              className="text-3xl md:text-4xl font-light tracking-[4px] text-[#222222] uppercase"
            />
            <div className="mt-4 w-24 h-0.5 bg-[#C62828] mx-auto" />
          </div>
          {featuredReviews.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No featured reviews yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {featuredReviews.map((review) => (
                <div key={review._id || review.id} className="bg-[#FFF8F0] p-6 rounded-2xl shadow-md hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-[#C62828]/10 text-[#C62828] flex items-center justify-center font-bold text-lg uppercase">
                      {review.customer_name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-[#222222]">{review.customer_name}</h3>
                      <StarRating rating={review.rating} />
                    </div>
                  </div>
                  {/* ✅ Review image (if any) */}
                  {review.image && (
                    <img src={review.image} alt="review" className="w-full h-32 object-cover rounded-lg mb-3" />
                  )}
                  <p className="text-[#444] text-sm leading-relaxed italic">"{review.text}"</p>
                  {review.reply && (
                    <div className="mt-3 bg-white p-3 rounded-lg text-sm text-gray-700">
                      <span className="font-medium">Reply:</span> {review.reply}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="text-center mt-10">
            <Link to="/reviews" className="px-6 py-3 bg-[#C62828] text-white font-semibold rounded-full hover:bg-[#B71C1C] transition-colors inline-block">
              Read More Reviews
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <Helmet>
        <title>Solohans Delicious Meals – Food Delivery in Lagos | Nigerian Meals Near You</title>
        <meta name="description" content="Order fresh Nigerian meals online in Lagos. Jollof rice, egusi soup, fried rice, amala, and more – affordable food delivery near you. Call +234 808 194 1298." />
        <meta name="keywords" content="restaurant Surulere Lagos, food delivery Lagos, fresh meals Lagos, Solohans Delicious Meals, Adeniran Ogunsanya Surulere" />
        <link rel="canonical" href="https://www.solohansmeals.com/" />
        <meta property="og:title" content="Solohans Delicious Meals – Surulere, Lagos" />
        <meta property="og:description" content="Fresh, tasty meals delivered in Surulere, Lagos. Call +234 808 194 1298." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.solohansmeals.com/" />
        <meta property="og:image" content="https://www.solohansmeals.com/og-image.jpg" />
        <meta property="og:locale" content="en_NG" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Restaurant",
            "name": "Solohans Delicious Meals",
            "description": "Fresh and tasty meals delivered daily in Surulere, Lagos.",
            "address": { "@type": "PostalAddress", "streetAddress": "Adeniran Ogunsanya Street", "addressLocality": "Surulere", "addressRegion": "Lagos", "postalCode": "100001", "addressCountry": "NG" },
            "telephone": "+234-808-194-1298",
            "email": "info@solohans.com",
            "servesCuisine": "Local, Continental",
            "priceRange": "₦₦",
            "url": "https://www.solohansmeals.com",
            "sameAs": ["https://www.facebook.com/SoloHansDelicious", "https://www.instagram.com/solohansdeliciousmeal50", "https://www.tiktok.com/@solohans.delicious.meals"]
          })}
        </script>
      </Helmet>

      <HeroCarousel />
      <WhyChooseUsSection />
      <DishesSection />
      <CategoriesSection />
      <TestimonialsSection />
    </>
  );
}