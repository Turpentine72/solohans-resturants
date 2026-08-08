import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Search, Plus, Edit, Trash2, X, Star, Upload, ChefHat, Package } from 'lucide-react';
import { menuItems as menuItemsApi, categories as categoriesApi, ingredients as ingredientsApi, uploadFile } from '../../lib/api';

export default function MenuManagement() {
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ingredientList, setIngredientList] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({
    name: '',
    category_id: '',
    price: '',
    description: '',
    image: null,
    imagePreview: '',
    available: true,
    signature: false,
    trackDailyStock: false,
    recipe: [], // [{ key, qtyPerUnit }] — powers automatic ingredient deduction
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchMenuItems();
    fetchIngredients();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await categoriesApi.getAll();
      setCategories(Array.isArray(data) ? data : data.categories || []);
    } catch (err) { console.error('Error fetching categories:', err); }
  };

  const fetchMenuItems = async () => {
    setLoading(true);
    try {
      const data = await menuItemsApi.getAll();
      setMenuItems(Array.isArray(data) ? data : data.items || []);
    } catch (err) { console.error('Error fetching menu items:', err); }
    finally { setLoading(false); }
  };

  const fetchIngredients = async () => {
    try {
      setIngredientList(await ingredientsApi.getAll());
    } catch (err) { console.error('Error fetching ingredients:', err); }
  };

  const filteredItems = menuItems.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.categories?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenAdd = () => {
    if (!categories.length) {
      alert('Categories are still loading. Please wait...');
      return;
    }
    setEditingItem(null);
    setForm({
      name: '',
      category_id: categories[0]?._id || '',
      price: '',
      description: '',
      image: null,
      imagePreview: '',
      available: true,
      signature: false,
      trackDailyStock: false,
      recipe: [],
    });
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      category_id: item.category_id || '',
      price: item.price.toString(),
      description: item.description || '',
      image: null,
      imagePreview: item.image,
      available: item.available,
      signature: item.signature,
      trackDailyStock: !!item.trackDailyStock,
      recipe: Array.isArray(item.ingredients) ? item.ingredients.map((r) => ({ key: r.key, qtyPerUnit: r.qtyPerUnit })) : [],
    });
    setShowModal(true);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setForm({
        ...form,
        image: file,
        imagePreview: URL.createObjectURL(file),
      });
    }
  };

  const uploadImage = async (file) => {
    try { return await uploadFile(file, 'menu-images'); }
    catch (err) { console.error('Upload error:', err); return null; }
  };

  // ─── Recipe row helpers ────────────────────────────────────────────
  const addRecipeRow = () => {
    const firstUnused = ingredientList.find((i) => !form.recipe.some((r) => r.key === i.key));
    if (!firstUnused) return alert('All available ingredients are already in this recipe, or none exist yet — create one on the Ingredient Inventory page first.');
    setForm({ ...form, recipe: [...form.recipe, { key: firstUnused.key, qtyPerUnit: 1 }] });
  };
  const updateRecipeRow = (index, field, value) => {
    const recipe = [...form.recipe];
    recipe[index] = { ...recipe[index], [field]: field === 'qtyPerUnit' ? value : value };
    setForm({ ...form, recipe });
  };
  const removeRecipeRow = (index) => {
    setForm({ ...form, recipe: form.recipe.filter((_, i) => i !== index) });
  };

  const handleSave = async () => {
    // Validation
    if (!form.name.trim()) {
      alert('Please enter an item name');
      return;
    }
    if (!form.price || parseFloat(form.price) <= 0) {
      alert('Please enter a valid price');
      return;
    }
    if (!form.category_id) {
      alert('Please select a category');
      return;
    }
    for (const row of form.recipe) {
      if (!row.key || !(Number(row.qtyPerUnit) > 0)) {
        alert('Every recipe row needs an ingredient and a quantity greater than 0.');
        return;
      }
    }

    setSaving(true);

    let imageUrl = form.imagePreview;
    if (form.image) {
      const uploadedUrl = await uploadImage(form.image);
      if (uploadedUrl) {
        imageUrl = uploadedUrl;
      } else {
        setSaving(false);
        alert('Failed to upload image. Please try again.');
        return;
      }
    }

    const dataToSave = {
      name: form.name.trim(),
      category_id: form.category_id,
      price: parseFloat(form.price),
      description: form.description?.trim() || '',
      image: imageUrl,
      available: form.available,
      signature: form.signature,
      trackDailyStock: form.trackDailyStock,
      // Generic recipe — this is what makes ingredient deduction "just work"
      // in POS/website checkout for ANY menu item, not only the hardcoded
      // Shawarma variants.
      ingredients: form.recipe.map((r) => ({ key: r.key, qtyPerUnit: Number(r.qtyPerUnit) })),
    };

    try {
      if (editingItem) {
        await menuItemsApi.update(editingItem._id || editingItem.id, dataToSave);
      } else {
        await menuItemsApi.create(dataToSave);
      }
      setShowModal(false);
      fetchMenuItems(); // refresh list
    } catch (err) {
      console.error('Save error:', err);
      alert(`Failed to save item: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!id) {
      console.error('Delete failed: no item ID');
      return;
    }
    if (!window.confirm('Delete this item?')) return;
    try {
      await menuItemsApi.delete(id);
      fetchMenuItems();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete item');
    }
  };

  const toggleAvailability = async (id, current) => {
    if (!id) return;
    try {
      await menuItemsApi.update(id, { available: !current });
      fetchMenuItems();
    } catch (err) { console.error(err); }
  };

  const toggleSignature = async (id, current) => {
    if (!id) return;
    try {
      await menuItemsApi.update(id, { signature: !current });
      fetchMenuItems();
    } catch (err) { console.error(err); }
  };

  const getCategoryName = (item) => item.categories?.name || 'Uncategorized';

  return (
    <>
      <Helmet><title>Menu Management – Solohans Admin</title></Helmet>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Menu Management</h1>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 bg-[#C62828] text-white px-5 py-2.5 rounded-full font-semibold hover:bg-[#B71C1C] transition-colors"
          >
            <Plus size={18} />
            Add Food Item
          </button>
        </div>

        <div className="relative max-w-md mb-6">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or category..."
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#C62828] bg-white"
          />
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading menu items…</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No menu items found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredItems.map((item) => (
              <div key={item._id || item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all">
                <div className="h-48 overflow-hidden">
                  <img src={item.image || 'https://via.placeholder.com/300x200?text=No+Image'} alt={item.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-gray-800 text-lg leading-tight">{item.name}</h3>
                    <span className="text-sm font-bold text-[#C62828]">₦{item.price}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{getCategoryName(item)}</p>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{item.description}</p>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <button
                      onClick={() => toggleAvailability(item._id, item.available)}
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        item.available ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                      }`}
                    >
                      {item.available ? 'Available' : 'Unavailable'}
                    </button>
                    <button
                      onClick={() => toggleSignature(item._id, item.signature)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        item.signature ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      <Star size={12} fill={item.signature ? '#EAB308' : 'none'} />
                      {item.signature ? 'Signature' : 'Normal'}
                    </button>
                    {Array.isArray(item.ingredients) && item.ingredients.length > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-orange-50 text-orange-700 border-orange-200">
                        <ChefHat size={12} /> Has Recipe
                      </span>
                    )}
                    {item.trackDailyStock && (
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        (item.remaining || 0) > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        <Package size={12} /> {(item.remaining || 0) > 0 ? `${item.remaining} left today` : 'Out of stock today'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <button onClick={() => handleOpenEdit(item)} className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg text-sm font-medium transition-colors"><Edit size={14} /> Edit</button>
                    <button onClick={() => handleDelete(item._id)} className="flex items-center gap-1 text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg text-sm font-medium transition-colors"><Trash2 size={14} /> Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b">
                <h3 className="text-xl font-bold text-gray-800">{editingItem ? 'Edit Food Item' : 'Add Food Item'}</h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#C62828]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#C62828] bg-white">
                    {categories.length === 0 && <option value="">Loading categories...</option>}
                    {categories.map(cat => <option key={cat._id} value={cat._id}>{cat.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price (₦)</label>
                  <input type="number" step="0.01" value={form.price} onChange={e => setForm({...form, price: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#C62828]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#C62828] resize-none" placeholder="Delicious meal description..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-[#C62828] transition-colors">
                    {form.imagePreview ? <img src={form.imagePreview} alt="Preview" className="h-full w-auto object-contain p-1" /> : <div className="flex flex-col items-center text-gray-400"><Upload size={24} /><span className="text-sm mt-1">Click to upload image</span></div>}
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  </label>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.available} onChange={e => setForm({...form, available: e.target.checked})} className="w-4 h-4 rounded accent-[#C62828]" /><span className="text-sm">Available</span></label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.signature} onChange={e => setForm({...form, signature: e.target.checked})} className="w-4 h-4 rounded accent-[#C62828]" /><span className="text-sm">Signature Dish</span></label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.trackDailyStock} onChange={e => setForm({...form, trackDailyStock: e.target.checked})} className="w-4 h-4 rounded accent-[#C62828]" /><span className="text-sm">Track Daily Stock (limited portions)</span></label>
                </div>
                {form.trackDailyStock && (
                  <p className="text-xs text-gray-500 -mt-2">This dish will appear on the Daily Dish Stock page, where you set today's opening quantity each morning. Once it sells out for the day, it's automatically marked Out of Stock on the menu.</p>
                )}

                {/* Recipe builder — links this item to the ingredient-deduction engine */}
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between mb-2 mt-3">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><ChefHat size={16} /> Recipe (optional)</label>
                    <button type="button" onClick={addRecipeRow} className="text-xs font-semibold text-[#C62828] hover:underline">+ Add ingredient</button>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    Link tracked ingredients so stock is deducted automatically on every sale — POS, website, everywhere.
                    {ingredientList.length === 0 && ' No ingredients exist yet — add one on the Ingredient Inventory page first.'}
                  </p>
                  {form.recipe.length > 0 && (
                    <div className="space-y-2">
                      {form.recipe.map((row, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <select
                            value={row.key}
                            onChange={(e) => updateRecipeRow(idx, 'key', e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          >
                            {ingredientList.map((ing) => (
                              <option key={ing.key} value={ing.key}>{ing.label} ({ing.pieceLabel})</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="1"
                            value={row.qtyPerUnit}
                            onChange={(e) => updateRecipeRow(idx, 'qtyPerUnit', e.target.value)}
                            className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            title="Quantity used per one unit sold"
                          />
                          <button type="button" onClick={() => removeRecipeRow(idx)} className="p-2 text-gray-400 hover:text-red-600">
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 p-5 border-t">
                <button onClick={() => setShowModal(false)} className="px-5 py-3 border border-gray-200 rounded-full text-gray-700 font-medium hover:bg-gray-50">Cancel</button>
                <button onClick={handleSave} disabled={saving} className={`px-5 py-3 bg-[#C62828] text-white rounded-full font-semibold hover:bg-[#B71C1C] transition-colors ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}>
                  {saving ? 'Saving…' : editingItem ? 'Update' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}