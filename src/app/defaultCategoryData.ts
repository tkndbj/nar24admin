// defaultCategoryData.ts
// Every entry now has a `labels` object with tr/en/ru translations.
// This is both the first-publish seed and the offline fallback for Flutter.

export const DEFAULT_CATEGORY_DATA = {
    buyerCategories: [
      {
        key: "Women",
        image: "women.jpg",
        labels: { tr: "Kadın", en: "Women", ru: "Женщины" },
        subcategories: [
          {
            key: "Fashion",
            labels: { tr: "Moda", en: "Fashion", ru: "Мода" },
            subSubcategories: [
              { key: "Dresses", labels: { tr: "Elbiseler", en: "Dresses", ru: "Платья" } },
              { key: "Tops & Shirts", labels: { tr: "Üstler & Gömlekler", en: "Tops & Shirts", ru: "Топы и рубашки" } },
              { key: "Bottoms", labels: { tr: "Altlar", en: "Bottoms", ru: "Низ" } },
              { key: "Outerwear", labels: { tr: "Dış Giyim", en: "Outerwear", ru: "Верхняя одежда" } },
              { key: "Underwear & Sleepwear", labels: { tr: "İç Çamaşırı & Gecelik", en: "Underwear & Sleepwear", ru: "Нижнее бельё" } },
              { key: "Swimwear", labels: { tr: "Mayo & Bikini", en: "Swimwear", ru: "Купальники" } },
              { key: "Activewear", labels: { tr: "Spor Giyim", en: "Activewear", ru: "Спортивная одежда" } },
              { key: "Suits & Formal", labels: { tr: "Takım Elbise & Resmi", en: "Suits & Formal", ru: "Костюмы" } },
              { key: "Traditional & Cultural", labels: { tr: "Geleneksel & Kültürel", en: "Traditional & Cultural", ru: "Традиционная одежда" } },
            ],
          },
          {
            key: "Shoes",
            labels: { tr: "Ayakkabı", en: "Shoes", ru: "Обувь" },
            subSubcategories: [
              { key: "Sneakers & Athletic", labels: { tr: "Spor Ayakkabı", en: "Sneakers & Athletic", ru: "Кроссовки" } },
              { key: "Casual Shoes", labels: { tr: "Günlük Ayakkabı", en: "Casual Shoes", ru: "Повседневная обувь" } },
              { key: "Formal Shoes", labels: { tr: "Resmi Ayakkabı", en: "Formal Shoes", ru: "Формальная обувь" } },
              { key: "Boots", labels: { tr: "Botlar", en: "Boots", ru: "Ботинки" } },
              { key: "Sandals & Flip-Flops", labels: { tr: "Sandalet & Terlik", en: "Sandals & Flip-Flops", ru: "Сандалии" } },
              { key: "Slippers", labels: { tr: "Ev Terlikleri", en: "Slippers", ru: "Тапочки" } },
              { key: "Specialized Footwear", labels: { tr: "Özel Ayakkabılar", en: "Specialized Footwear", ru: "Специальная обувь" } },
            ],
          },
          {
            key: "Accessories",
            labels: { tr: "Aksesuar", en: "Accessories", ru: "Аксессуары" },
            subSubcategories: [
              { key: "Jewelry", labels: { tr: "Takı", en: "Jewelry", ru: "Украшения" } },
              { key: "Watches", labels: { tr: "Saatler", en: "Watches", ru: "Часы" } },
              { key: "Belts", labels: { tr: "Kemerler", en: "Belts", ru: "Ремни" } },
              { key: "Hats & Caps", labels: { tr: "Şapkalar", en: "Hats & Caps", ru: "Шапки и кепки" } },
              { key: "Scarves & Wraps", labels: { tr: "Eşarplar", en: "Scarves & Wraps", ru: "Шарфы" } },
              { key: "Sunglasses & Eyewear", labels: { tr: "Güneş Gözlüğü", en: "Sunglasses & Eyewear", ru: "Очки" } },
              { key: "Gloves", labels: { tr: "Eldivenler", en: "Gloves", ru: "Перчатки" } },
              { key: "Hair Accessories", labels: { tr: "Saç Aksesuarları", en: "Hair Accessories", ru: "Аксессуары для волос" } },
              { key: "Other Accessories", labels: { tr: "Diğer Aksesuarlar", en: "Other Accessories", ru: "Другие аксессуары" } },
            ],
          },
          {
            key: "Bags",
            labels: { tr: "Çantalar", en: "Bags", ru: "Сумки" },
            subSubcategories: [
              { key: "Handbags", labels: { tr: "El Çantaları", en: "Handbags", ru: "Сумочки" } },
              { key: "Backpacks", labels: { tr: "Sırt Çantaları", en: "Backpacks", ru: "Рюкзаки" } },
              { key: "Travel Luggage", labels: { tr: "Bavul & Valiz", en: "Travel Luggage", ru: "Чемоданы" } },
              { key: "Sports & Gym Bags", labels: { tr: "Spor Çantaları", en: "Sports & Gym Bags", ru: "Спортивные сумки" } },
              { key: "Wallets & Small Accessories", labels: { tr: "Cüzdanlar", en: "Wallets & Small Accessories", ru: "Кошельки" } },
              { key: "Specialty Bags", labels: { tr: "Özel Çantalar", en: "Specialty Bags", ru: "Специальные сумки" } },
            ],
          },
          {
            key: "Self Care",
            labels: { tr: "Kişisel Bakım", en: "Self Care", ru: "Уход за собой" },
            subSubcategories: [
              { key: "Skincare", labels: { tr: "Cilt Bakımı", en: "Skincare", ru: "Уход за кожей" } },
              { key: "Makeup", labels: { tr: "Makyaj", en: "Makeup", ru: "Макияж" } },
              { key: "Haircare", labels: { tr: "Saç Bakımı", en: "Haircare", ru: "Уход за волосами" } },
              { key: "Fragrances", labels: { tr: "Parfümler", en: "Fragrances", ru: "Ароматы" } },
              { key: "Personal Hygiene", labels: { tr: "Kişisel Hijyen", en: "Personal Hygiene", ru: "Личная гигиена" } },
              { key: "Nail Care", labels: { tr: "Tırnak Bakımı", en: "Nail Care", ru: "Уход за ногтями" } },
              { key: "Body Care", labels: { tr: "Vücut Bakımı", en: "Body Care", ru: "Уход за телом" } },
              { key: "Oral Care", labels: { tr: "Ağız Bakımı", en: "Oral Care", ru: "Уход за полостью рта" } },
              { key: "Beauty Tools & Accessories", labels: { tr: "Güzellik Aletleri", en: "Beauty Tools & Accessories", ru: "Инструменты красоты" } },
            ],
          },
        ],
      },
      {
        key: "Men",
        image: "men.jpg",
        labels: { tr: "Erkek", en: "Men", ru: "Мужчины" },
        subcategories: [
          {
            key: "Fashion",
            labels: { tr: "Moda", en: "Fashion", ru: "Мода" },
            subSubcategories: [
              { key: "Tops & Shirts", labels: { tr: "Üstler & Gömlekler", en: "Tops & Shirts", ru: "Топы и рубашки" } },
              { key: "Bottoms", labels: { tr: "Altlar", en: "Bottoms", ru: "Низ" } },
              { key: "Outerwear", labels: { tr: "Dış Giyim", en: "Outerwear", ru: "Верхняя одежда" } },
              { key: "Underwear & Sleepwear", labels: { tr: "İç Çamaşırı", en: "Underwear & Sleepwear", ru: "Нижнее бельё" } },
              { key: "Swimwear", labels: { tr: "Mayo", en: "Swimwear", ru: "Плавки" } },
              { key: "Activewear", labels: { tr: "Spor Giyim", en: "Activewear", ru: "Спортивная одежда" } },
              { key: "Suits & Formal", labels: { tr: "Takım Elbise", en: "Suits & Formal", ru: "Костюмы" } },
              { key: "Traditional & Cultural", labels: { tr: "Geleneksel", en: "Traditional & Cultural", ru: "Традиционная одежда" } },
            ],
          },
          {
            key: "Shoes",
            labels: { tr: "Ayakkabı", en: "Shoes", ru: "Обувь" },
            subSubcategories: [
              { key: "Sneakers & Athletic", labels: { tr: "Spor Ayakkabı", en: "Sneakers & Athletic", ru: "Кроссовки" } },
              { key: "Casual Shoes", labels: { tr: "Günlük Ayakkabı", en: "Casual Shoes", ru: "Повседневная обувь" } },
              { key: "Formal Shoes", labels: { tr: "Resmi Ayakkabı", en: "Formal Shoes", ru: "Формальная обувь" } },
              { key: "Boots", labels: { tr: "Botlar", en: "Boots", ru: "Ботинки" } },
              { key: "Sandals & Flip-Flops", labels: { tr: "Sandalet", en: "Sandals & Flip-Flops", ru: "Сандалии" } },
              { key: "Slippers", labels: { tr: "Terlik", en: "Slippers", ru: "Тапочки" } },
              { key: "Specialized Footwear", labels: { tr: "Özel Ayakkabılar", en: "Specialized Footwear", ru: "Специальная обувь" } },
            ],
          },
          {
            key: "Accessories",
            labels: { tr: "Aksesuar", en: "Accessories", ru: "Аксессуары" },
            subSubcategories: [
              { key: "Watches", labels: { tr: "Saatler", en: "Watches", ru: "Часы" } },
              { key: "Belts", labels: { tr: "Kemerler", en: "Belts", ru: "Ремни" } },
              { key: "Hats & Caps", labels: { tr: "Şapkalar", en: "Hats & Caps", ru: "Шапки и кепки" } },
              { key: "Sunglasses & Eyewear", labels: { tr: "Güneş Gözlüğü", en: "Sunglasses & Eyewear", ru: "Очки" } },
              { key: "Gloves", labels: { tr: "Eldivenler", en: "Gloves", ru: "Перчатки" } },
              { key: "Other Accessories", labels: { tr: "Diğer", en: "Other Accessories", ru: "Другие" } },
            ],
          },
          {
            key: "Bags",
            labels: { tr: "Çantalar", en: "Bags", ru: "Сумки" },
            subSubcategories: [
              { key: "Backpacks", labels: { tr: "Sırt Çantaları", en: "Backpacks", ru: "Рюкзаки" } },
              { key: "Travel Luggage", labels: { tr: "Bavul", en: "Travel Luggage", ru: "Чемоданы" } },
              { key: "Briefcases & Business Bags", labels: { tr: "Evrak Çantaları", en: "Briefcases & Business Bags", ru: "Портфели" } },
              { key: "Sports & Gym Bags", labels: { tr: "Spor Çantaları", en: "Sports & Gym Bags", ru: "Спортивные сумки" } },
              { key: "Wallets & Small Accessories", labels: { tr: "Cüzdanlar", en: "Wallets & Small Accessories", ru: "Кошельки" } },
              { key: "Specialty Bags", labels: { tr: "Özel Çantalar", en: "Specialty Bags", ru: "Специальные сумки" } },
            ],
          },
          {
            key: "Self Care",
            labels: { tr: "Kişisel Bakım", en: "Self Care", ru: "Уход за собой" },
            subSubcategories: [
              { key: "Personal Hygiene", labels: { tr: "Kişisel Hijyen", en: "Personal Hygiene", ru: "Личная гигиена" } },
              { key: "Haircare", labels: { tr: "Saç Bakımı", en: "Haircare", ru: "Уход за волосами" } },
              { key: "Fragrances", labels: { tr: "Parfümler", en: "Fragrances", ru: "Ароматы" } },
              { key: "Body Care", labels: { tr: "Vücut Bakımı", en: "Body Care", ru: "Уход за телом" } },
              { key: "Oral Care", labels: { tr: "Ağız Bakımı", en: "Oral Care", ru: "Уход за полостью рта" } },
              { key: "Beauty Tools & Accessories", labels: { tr: "Bakım Aletleri", en: "Beauty Tools & Accessories", ru: "Инструменты" } },
            ],
          },
        ],
      },
      {
        key: "Mother & Child",
        image: "mother_child.jpg",
        labels: { tr: "Anne & Çocuk", en: "Mother & Child", ru: "Мать и дитя" },
        subcategories: [
          { key: "Baby Clothing", labels: { tr: "Bebek Giyim", en: "Baby Clothing", ru: "Одежда для малышей" }, subSubcategories: [
            { key: "Bodysuits", labels: { tr: "Bodysuit", en: "Bodysuits", ru: "Боди" } },
            { key: "Rompers", labels: { tr: "Tulum", en: "Rompers", ru: "Ромперы" } },
            { key: "Baby Sets", labels: { tr: "Bebek Takımları", en: "Baby Sets", ru: "Комплекты" } },
            { key: "Baby Sleepwear", labels: { tr: "Bebek Pijama", en: "Baby Sleepwear", ru: "Пижамы для малышей" } },
            { key: "Baby Socks", labels: { tr: "Bebek Çorabı", en: "Baby Socks", ru: "Носки для малышей" } },
            { key: "Baby Hats", labels: { tr: "Bebek Şapkası", en: "Baby Hats", ru: "Шапки для малышей" } },
            { key: "Baby Mittens", labels: { tr: "Bebek Eldiveni", en: "Baby Mittens", ru: "Рукавички" } },
          ]},
          { key: "Kids Clothing", labels: { tr: "Çocuk Giyim", en: "Kids Clothing", ru: "Детская одежда" }, subSubcategories: [
            { key: "Kids T-Shirts", labels: { tr: "Çocuk Tişörtü", en: "Kids T-Shirts", ru: "Детские футболки" } },
            { key: "Kids Pants", labels: { tr: "Çocuk Pantolonu", en: "Kids Pants", ru: "Детские брюки" } },
            { key: "Kids Dresses", labels: { tr: "Çocuk Elbisesi", en: "Kids Dresses", ru: "Детские платья" } },
            { key: "Kids Sweatshirts", labels: { tr: "Çocuk Sweatshirt", en: "Kids Sweatshirts", ru: "Детские свитшоты" } },
            { key: "Kids Jackets", labels: { tr: "Çocuk Montu", en: "Kids Jackets", ru: "Детские куртки" } },
            { key: "Kids Pajamas", labels: { tr: "Çocuk Pijama", en: "Kids Pajamas", ru: "Детские пижамы" } },
            { key: "School Uniforms", labels: { tr: "Okul Kıyafeti", en: "School Uniforms", ru: "Школьная форма" } },
          ]},
          { key: "Toys & Games", labels: { tr: "Oyuncak & Oyunlar", en: "Toys & Games", ru: "Игрушки и игры" }, subSubcategories: [
            { key: "Educational Toys", labels: { tr: "Eğitici Oyuncaklar", en: "Educational Toys", ru: "Развивающие игрушки" } },
            { key: "Plush Toys", labels: { tr: "Peluş Oyuncaklar", en: "Plush Toys", ru: "Плюшевые игрушки" } },
            { key: "Building Blocks", labels: { tr: "Lego & Bloklar", en: "Building Blocks", ru: "Конструкторы" } },
            { key: "Dolls & Action Figures", labels: { tr: "Bebekler & Figürler", en: "Dolls & Action Figures", ru: "Куклы и фигурки" } },
            { key: "Puzzles", labels: { tr: "Yapbozlar", en: "Puzzles", ru: "Пазлы" } },
            { key: "Board Games", labels: { tr: "Kutu Oyunları", en: "Board Games", ru: "Настольные игры" } },
            { key: "Electronic Toys", labels: { tr: "Elektronik Oyuncaklar", en: "Electronic Toys", ru: "Электронные игрушки" } },
            { key: "Outdoor Play", labels: { tr: "Açık Hava Oyunları", en: "Outdoor Play", ru: "Игры на улице" } },
          ]},
          { key: "Baby Care", labels: { tr: "Bebek Bakımı", en: "Baby Care", ru: "Уход за малышом" }, subSubcategories: [
            { key: "Diapers", labels: { tr: "Bezler", en: "Diapers", ru: "Подгузники" } },
            { key: "Baby Wipes", labels: { tr: "Islak Mendil", en: "Baby Wipes", ru: "Влажные салфетки" } },
            { key: "Baby Skincare", labels: { tr: "Bebek Cilt Bakımı", en: "Baby Skincare", ru: "Уход за кожей малыша" } },
            { key: "Baby Bath Products", labels: { tr: "Bebek Banyo", en: "Baby Bath Products", ru: "Средства для купания" } },
            { key: "Baby Health", labels: { tr: "Bebek Sağlığı", en: "Baby Health", ru: "Здоровье малыша" } },
            { key: "Baby Monitors", labels: { tr: "Bebek Telsizi", en: "Baby Monitors", ru: "Радионяня" } },
          ]},
          { key: "Maternity", labels: { tr: "Hamilelik", en: "Maternity", ru: "Для беременных" }, subSubcategories: [
            { key: "Maternity Clothing", labels: { tr: "Hamile Giyim", en: "Maternity Clothing", ru: "Одежда для беременных" } },
            { key: "Nursing Bras", labels: { tr: "Emzirme Sütyeni", en: "Nursing Bras", ru: "Бюстгальтеры для кормления" } },
            { key: "Maternity Accessories", labels: { tr: "Hamile Aksesuarları", en: "Maternity Accessories", ru: "Аксессуары для беременных" } },
            { key: "Pregnancy Support", labels: { tr: "Gebelik Desteği", en: "Pregnancy Support", ru: "Поддержка беременности" } },
          ]},
        ],
      },
      {
        key: "Home & Furniture",
        image: "home_furniture.jpg",
        labels: { tr: "Ev & Mobilya", en: "Home & Furniture", ru: "Дом и мебель" },
        subcategories: [
          { key: "Living Room Furniture", labels: { tr: "Oturma Odası", en: "Living Room Furniture", ru: "Гостиная" }, subSubcategories: [
            { key: "Sofas", labels: { tr: "Koltuklar", en: "Sofas", ru: "Диваны" } },
            { key: "Armchairs", labels: { tr: "Berjerler", en: "Armchairs", ru: "Кресла" } },
            { key: "Coffee Tables", labels: { tr: "Sehpalar", en: "Coffee Tables", ru: "Журнальные столики" } },
            { key: "TV Stands", labels: { tr: "TV Sehpaları", en: "TV Stands", ru: "Тумбы под ТВ" } },
            { key: "Bookcases", labels: { tr: "Kitaplıklar", en: "Bookcases", ru: "Книжные полки" } },
            { key: "Side Tables", labels: { tr: "Yan Sehpalar", en: "Side Tables", ru: "Приставные столики" } },
            { key: "Ottoman", labels: { tr: "Puf", en: "Ottoman", ru: "Пуф" } },
            { key: "Recliners", labels: { tr: "Uzanma Koltukları", en: "Recliners", ru: "Кресла-реклайнеры" } },
          ]},
          { key: "Bedroom Furniture", labels: { tr: "Yatak Odası", en: "Bedroom Furniture", ru: "Спальня" }, subSubcategories: [
            { key: "Beds", labels: { tr: "Yataklar", en: "Beds", ru: "Кровати" } },
            { key: "Mattresses", labels: { tr: "Matraslar", en: "Mattresses", ru: "Матрасы" } },
            { key: "Wardrobes", labels: { tr: "Dolaplar", en: "Wardrobes", ru: "Шкафы" } },
            { key: "Dressers", labels: { tr: "Şifonyer", en: "Dressers", ru: "Комоды" } },
            { key: "Nightstands", labels: { tr: "Komodinler", en: "Nightstands", ru: "Прикроватные тумбочки" } },
            { key: "Mirrors", labels: { tr: "Aynalar", en: "Mirrors", ru: "Зеркала" } },
            { key: "Bed Frames", labels: { tr: "Yatak Çerçeveleri", en: "Bed Frames", ru: "Каркасы кроватей" } },
            { key: "Headboards", labels: { tr: "Başlıklar", en: "Headboards", ru: "Изголовья" } },
          ]},
          { key: "Home Decor", labels: { tr: "Ev Dekorasyonu", en: "Home Decor", ru: "Декор дома" }, subSubcategories: [
            { key: "Wall Art", labels: { tr: "Duvar Sanatı", en: "Wall Art", ru: "Настенное искусство" } },
            { key: "Candles", labels: { tr: "Mumlar", en: "Candles", ru: "Свечи" } },
            { key: "Vases", labels: { tr: "Vazolar", en: "Vases", ru: "Вазы" } },
            { key: "Clocks", labels: { tr: "Saatler", en: "Clocks", ru: "Часы" } },
            { key: "Artificial Plants", labels: { tr: "Yapay Bitkiler", en: "Artificial Plants", ru: "Искусственные растения" } },
          ]},
        ],
      },
      {
        key: "Electronics",
        image: "electronics.jpg",
        labels: { tr: "Elektronik", en: "Electronics", ru: "Электроника" },
        subcategories: [
          { key: "Smartphones & Accessories", labels: { tr: "Telefon & Aksesuar", en: "Smartphones & Accessories", ru: "Смартфоны" }, subSubcategories: [
            { key: "Smartphones", labels: { tr: "Akıllı Telefonlar", en: "Smartphones", ru: "Смартфоны" } },
            { key: "Phone Cases", labels: { tr: "Telefon Kılıfları", en: "Phone Cases", ru: "Чехлы" } },
            { key: "Chargers", labels: { tr: "Şarj Aletleri", en: "Chargers", ru: "Зарядные устройства" } },
            { key: "Power Banks", labels: { tr: "Powerbank", en: "Power Banks", ru: "Павербанки" } },
          ]},
          { key: "Computers & Laptops", labels: { tr: "Bilgisayar & Laptop", en: "Computers & Laptops", ru: "Компьютеры" }, subSubcategories: [
            { key: "Laptops", labels: { tr: "Dizüstü Bilgisayar", en: "Laptops", ru: "Ноутбуки" } },
            { key: "Desktop Computers", labels: { tr: "Masaüstü Bilgisayar", en: "Desktop Computers", ru: "Настольные ПК" } },
            { key: "Tablets", labels: { tr: "Tabletler", en: "Tablets", ru: "Планшеты" } },
            { key: "Monitors", labels: { tr: "Monitörler", en: "Monitors", ru: "Мониторы" } },
          ]},
          { key: "Audio Equipment", labels: { tr: "Ses Ekipmanları", en: "Audio Equipment", ru: "Аудиооборудование" }, subSubcategories: [
            { key: "Headphones", labels: { tr: "Kulaklıklar", en: "Headphones", ru: "Наушники" } },
            { key: "Earbuds", labels: { tr: "Kulak İçi Kulaklık", en: "Earbuds", ru: "Вкладыши" } },
            { key: "Speakers", labels: { tr: "Hoparlörler", en: "Speakers", ru: "Колонки" } },
          ]},
          { key: "Gaming", labels: { tr: "Oyun", en: "Gaming", ru: "Игры" }, subSubcategories: [
            { key: "Gaming Consoles", labels: { tr: "Oyun Konsolları", en: "Gaming Consoles", ru: "Игровые консоли" } },
            { key: "Video Games", labels: { tr: "Video Oyunları", en: "Video Games", ru: "Видеоигры" } },
            { key: "Gaming Controllers", labels: { tr: "Oyun Kumandaları", en: "Gaming Controllers", ru: "Геймпады" } },
            { key: "Gaming Headsets", labels: { tr: "Oyuncu Kulaklıkları", en: "Gaming Headsets", ru: "Игровые гарнитуры" } },
          ]},
        ],
      },
      {
        key: "Sports & Outdoor",
        image: "sports_outdoor.jpg",
        labels: { tr: "Spor & Outdoor", en: "Sports & Outdoor", ru: "Спорт и отдых" },
        subcategories: [
          { key: "Fitness & Exercise", labels: { tr: "Fitness & Egzersiz", en: "Fitness & Exercise", ru: "Фитнес" }, subSubcategories: [
            { key: "Cardio Equipment", labels: { tr: "Kardio Ekipmanları", en: "Cardio Equipment", ru: "Кардиооборудование" } },
            { key: "Strength Training", labels: { tr: "Güç Antrenmanı", en: "Strength Training", ru: "Силовые тренировки" } },
            { key: "Yoga Equipment", labels: { tr: "Yoga Ekipmanları", en: "Yoga Equipment", ru: "Йога" } },
            { key: "Home Gym", labels: { tr: "Ev Spor Salonu", en: "Home Gym", ru: "Домашний спортзал" } },
          ]},
          { key: "Cycling", labels: { tr: "Bisiklet", en: "Cycling", ru: "Велоспорт" }, subSubcategories: [
            { key: "Bicycles", labels: { tr: "Bisikletler", en: "Bicycles", ru: "Велосипеды" } },
            { key: "Bike Accessories", labels: { tr: "Bisiklet Aksesuarları", en: "Bike Accessories", ru: "Аксессуары для велосипеда" } },
            { key: "E-Bikes", labels: { tr: "Elektrikli Bisiklet", en: "E-Bikes", ru: "Электровелосипеды" } },
          ]},
        ],
      },
      {
        key: "Pet Supplies",
        image: "pet_supplies.jpg",
        labels: { tr: "Evcil Hayvan", en: "Pet Supplies", ru: "Товары для животных" },
        subcategories: [
          { key: "Dog Supplies", labels: { tr: "Köpek Ürünleri", en: "Dog Supplies", ru: "Товары для собак" }, subSubcategories: [
            { key: "Dog Food", labels: { tr: "Köpek Maması", en: "Dog Food", ru: "Корм для собак" } },
            { key: "Dog Toys", labels: { tr: "Köpek Oyuncakları", en: "Dog Toys", ru: "Игрушки для собак" } },
            { key: "Leashes & Collars", labels: { tr: "Tasma & Boyunluk", en: "Leashes & Collars", ru: "Поводки и ошейники" } },
          ]},
          { key: "Cat Supplies", labels: { tr: "Kedi Ürünleri", en: "Cat Supplies", ru: "Товары для кошек" }, subSubcategories: [
            { key: "Cat Food", labels: { tr: "Kedi Maması", en: "Cat Food", ru: "Корм для кошек" } },
            { key: "Cat Toys", labels: { tr: "Kedi Oyuncakları", en: "Cat Toys", ru: "Игрушки для кошек" } },
            { key: "Litter & Boxes", labels: { tr: "Kedi Kumu & Tuvaleti", en: "Litter & Boxes", ru: "Наполнитель и туалеты" } },
          ]},
        ],
      },
      {
        key: "Automotive",
        image: "automotive.jpg",
        labels: { tr: "Otomotiv", en: "Automotive", ru: "Автомобили" },
        subcategories: [
          { key: "Car Parts & Components", labels: { tr: "Araç Parçaları", en: "Car Parts & Components", ru: "Автозапчасти" }, subSubcategories: [
            { key: "Engine Parts", labels: { tr: "Motor Parçaları", en: "Engine Parts", ru: "Запчасти двигателя" } },
            { key: "Brake Components", labels: { tr: "Fren Sistemi", en: "Brake Components", ru: "Тормозная система" } },
            { key: "Filters", labels: { tr: "Filtreler", en: "Filters", ru: "Фильтры" } },
          ]},
          { key: "Car Electronics", labels: { tr: "Araç Elektroniği", en: "Car Electronics", ru: "Автоэлектроника" }, subSubcategories: [
            { key: "Car Audio", labels: { tr: "Araç Ses Sistemi", en: "Car Audio", ru: "Автозвук" } },
            { key: "GPS & Navigation", labels: { tr: "GPS & Navigasyon", en: "GPS & Navigation", ru: "GPS навигация" } },
            { key: "Dash Cams", labels: { tr: "Araç Kamerası", en: "Dash Cams", ru: "Видеорегистраторы" } },
          ]},
        ],
      },
      {
        key: "Health & Wellness",
        image: "health_wellness.jpg",
        labels: { tr: "Sağlık & Wellness", en: "Health & Wellness", ru: "Здоровье" },
        subcategories: [
          { key: "Vitamins & Supplements", labels: { tr: "Vitamin & Takviye", en: "Vitamins & Supplements", ru: "Витамины и добавки" }, subSubcategories: [
            { key: "Multivitamins", labels: { tr: "Multivitaminler", en: "Multivitamins", ru: "Мультивитамины" } },
            { key: "Omega-3", labels: { tr: "Omega-3", en: "Omega-3", ru: "Омега-3" } },
            { key: "Probiotics", labels: { tr: "Probiyotikler", en: "Probiotics", ru: "Пробиотики" } },
          ]},
          { key: "Medical Equipment", labels: { tr: "Tıbbi Ekipman", en: "Medical Equipment", ru: "Медицинское оборудование" }, subSubcategories: [
            { key: "Blood Pressure Monitors", labels: { tr: "Tansiyon Aleti", en: "Blood Pressure Monitors", ru: "Тонометры" } },
            { key: "Thermometers", labels: { tr: "Termometreler", en: "Thermometers", ru: "Термометры" } },
            { key: "Pulse Oximeters", labels: { tr: "Nabız Oksimetresi", en: "Pulse Oximeters", ru: "Пульсоксиметры" } },
          ]},
        ],
      },
      {
        key: "Books, Stationery & Hobby",
        image: "books_stationery_hobby.jpg",
        labels: { tr: "Kitap, Kırtasiye & Hobi", en: "Books, Stationery & Hobby", ru: "Книги, канцелярия и хобби" },
        subcategories: [
          { key: "Books & Literature", labels: { tr: "Kitaplar", en: "Books & Literature", ru: "Книги" }, subSubcategories: [
            { key: "Fiction Books", labels: { tr: "Roman", en: "Fiction Books", ru: "Художественная литература" } },
            { key: "Non-Fiction Books", labels: { tr: "Non-Fiction", en: "Non-Fiction Books", ru: "Нехудожественная литература" } },
            { key: "Educational Books", labels: { tr: "Eğitim Kitapları", en: "Educational Books", ru: "Учебники" } },
          ]},
          { key: "Hobbies & Collections", labels: { tr: "Hobi & Koleksiyon", en: "Hobbies & Collections", ru: "Хобби и коллекции" }, subSubcategories: [
            { key: "Board Games", labels: { tr: "Kutu Oyunları", en: "Board Games", ru: "Настольные игры" } },
            { key: "Puzzles", labels: { tr: "Yapbozlar", en: "Puzzles", ru: "Пазлы" } },
            { key: "Collectibles", labels: { tr: "Koleksiyon", en: "Collectibles", ru: "Коллекционные предметы" } },
          ]},
        ],
      },
      {
        key: "Flowers & Gifts",
        image: "flowers_gifts.jpg",
        labels: { tr: "Çiçek & Hediye", en: "Flowers & Gifts", ru: "Цветы и подарки" },
        subcategories: [
          { key: "Bouquets & Arrangements", labels: { tr: "Buketler & Aranjmanlar", en: "Bouquets & Arrangements", ru: "Букеты и аранжировки" }, subSubcategories: [
            { key: "Bouquets", labels: { tr: "Buketler", en: "Bouquets", ru: "Букеты" } },
            { key: "Flower Arrangements", labels: { tr: "Çiçek Aranjmanları", en: "Flower Arrangements", ru: "Цветочные аранжировки" } },
          ]},
          { key: "Gift Arrangements", labels: { tr: "Hediye Aranjmanları", en: "Gift Arrangements", ru: "Подарочные наборы" }, subSubcategories: [
            { key: "Chocolate Arrangements", labels: { tr: "Çikolata Aranjmanları", en: "Chocolate Arrangements", ru: "Шоколадные наборы" } },
            { key: "Fruit Baskets", labels: { tr: "Meyve Sepetleri", en: "Fruit Baskets", ru: "Фруктовые корзины" } },
          ]},
        ],
      },
      {
        key: "Tools & Hardware",
        image: "tools_hardware.jpg",
        labels: { tr: "Alet & Donanım", en: "Tools & Hardware", ru: "Инструменты" },
        subcategories: [
          { key: "Hand Tools", labels: { tr: "El Aletleri", en: "Hand Tools", ru: "Ручные инструменты" }, subSubcategories: [
            { key: "Hammers", labels: { tr: "Çekiçler", en: "Hammers", ru: "Молотки" } },
            { key: "Screwdrivers", labels: { tr: "Tornavidalar", en: "Screwdrivers", ru: "Отвёртки" } },
            { key: "Wrenches", labels: { tr: "Anahtarlar", en: "Wrenches", ru: "Гаечные ключи" } },
          ]},
          { key: "Power Tools", labels: { tr: "Elektrikli Aletler", en: "Power Tools", ru: "Электроинструменты" }, subSubcategories: [
            { key: "Drills", labels: { tr: "Matkaplar", en: "Drills", ru: "Дрели" } },
            { key: "Sanders", labels: { tr: "Zımparalar", en: "Sanders", ru: "Шлифовальные машины" } },
            { key: "Grinders", labels: { tr: "Taşlama Makineleri", en: "Grinders", ru: "Болгарки" } },
          ]},
        ],
      },
    ],
    buyerToProductMapping: {
      Women: {
        Fashion: "Clothing & Fashion",
        Shoes: "Footwear",
        Accessories: "Accessories",
        Bags: "Bags & Luggage",
        "Self Care": "Beauty & Personal Care",
      },
      Men: {
        Fashion: "Clothing & Fashion",
        Shoes: "Footwear",
        Accessories: "Accessories",
        Bags: "Bags & Luggage",
        "Self Care": "Beauty & Personal Care",
      },
    },
  };