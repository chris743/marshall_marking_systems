class Product {
  final String id;
  final String description;
  final String gtin;
  final String? companyName;
  final String? commodity;
  final String? externalUpc;
  final String? externalPlu;
  final Map<String, dynamic> rawData;

  Product({
    required this.id,
    required this.description,
    required this.gtin,
    this.companyName,
    this.commodity,
    this.externalUpc,
    this.externalPlu,
    this.rawData = const {},
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id']?.toString() ?? '',
      description: json['description'] ?? '',
      gtin: json['gtin'] ?? '',
      companyName: json['company_name'],
      commodity: json['commodity'],
      externalUpc: json['external_upc'],
      externalPlu: json['external_plu'],
      rawData: json,
    );
  }

  Map<String, dynamic> toJson() => rawData;

  /// Get any field by name (for variable substitution)
  String? getField(String fieldName) {
    return rawData[fieldName]?.toString();
  }
}
