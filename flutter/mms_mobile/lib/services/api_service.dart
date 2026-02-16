import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/printer.dart';
import '../models/template.dart';
import '../models/product.dart';
import '../models/scanner.dart';

class ApiService {
  final String baseUrl;
  final http.Client _client;

  ApiService({required this.baseUrl}) : _client = http.Client();

  // ============ PRINTERS ============

  Future<List<Printer>> getPrinters() async {
    final response = await _client.get(Uri.parse('$baseUrl/api/printers'));
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data['success'] == true) {
        return (data['printers'] as List)
            .map((p) => Printer.fromJson(p))
            .toList();
      }
    }
    throw Exception('Failed to load printers');
  }

  Future<void> printLabel(String printerId, String zpl, {int copies = 1}) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/printers/$printerId/print'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({'zpl': zpl, 'copies': copies}),
    );
    if (response.statusCode != 200) {
      final data = json.decode(response.body);
      throw Exception(data['error'] ?? 'Print failed');
    }
  }

  Future<void> startContinuousPrint(String printerId, String zpl) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/printers/$printerId/print/continuous'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({'zpl': zpl}),
    );
    if (response.statusCode != 200) {
      final data = json.decode(response.body);
      throw Exception(data['error'] ?? 'Failed to start continuous print');
    }
  }

  Future<void> stopContinuousPrint(String printerId) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/printers/$printerId/print/continuous/stop'),
    );
    if (response.statusCode != 200) {
      final data = json.decode(response.body);
      throw Exception(data['error'] ?? 'Failed to stop continuous print');
    }
  }

  // ============ TEMPLATES ============

  Future<List<LabelTemplate>> getTemplates() async {
    final response = await _client.get(Uri.parse('$baseUrl/api/templates'));
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data['success'] == true) {
        return (data['templates'] as List)
            .map((t) => LabelTemplate.fromJson(t))
            .toList();
      }
    }
    throw Exception('Failed to load templates');
  }

  Future<LabelTemplate> getTemplate(String templateId) async {
    final response = await _client.get(Uri.parse('$baseUrl/api/templates/$templateId'));
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data['success'] == true) {
        return LabelTemplate.fromJson(data['template']);
      }
    }
    throw Exception('Failed to load template');
  }

  // ============ PRODUCTS ============

  Future<List<Product>> searchProducts(String query, {int limit = 20}) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/products/search?q=${Uri.encodeComponent(query)}&limit=$limit'),
    );
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data['success'] == true) {
        return (data['products'] as List)
            .map((p) => Product.fromJson(p))
            .toList();
      }
    }
    throw Exception('Failed to search products');
  }

  Future<Product> getProduct(String productId) async {
    final response = await _client.get(Uri.parse('$baseUrl/api/products/$productId'));
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data['success'] == true) {
        return Product.fromJson(data['product']);
      }
    }
    throw Exception('Failed to load product');
  }

  // ============ SCANNERS ============

  Future<List<Scanner>> getScanners() async {
    final response = await _client.get(Uri.parse('$baseUrl/api/scanners'));
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data['success'] == true) {
        return (data['scanners'] as List)
            .map((s) => Scanner.fromJson(s))
            .toList();
      }
    }
    throw Exception('Failed to load scanners');
  }

  // ============ PRINTER CONFIG ============

  Future<Map<String, dynamic>?> getPrinterConfig(String printerId) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/printer-configs/$printerId'),
    );
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data['success'] == true) {
        return data['config'];
      }
    }
    return null;
  }

  Future<void> savePrinterConfig(String printerId, Map<String, dynamic> config) async {
    final response = await _client.put(
      Uri.parse('$baseUrl/api/printer-configs/$printerId'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode(config),
    );
    if (response.statusCode != 200) {
      final data = json.decode(response.body);
      throw Exception(data['error'] ?? 'Failed to save config');
    }
  }

  // ============ SCAN EVENTS ============

  Future<void> processScan(String barcode, {String? scannerId, String? printerId}) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/scan'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'barcode': barcode,
        'scanner_id': scannerId,
        'printer_id': printerId,
      }),
    );
    if (response.statusCode != 200) {
      final data = json.decode(response.body);
      throw Exception(data['error'] ?? 'Scan processing failed');
    }
  }

  void dispose() {
    _client.close();
  }
}
