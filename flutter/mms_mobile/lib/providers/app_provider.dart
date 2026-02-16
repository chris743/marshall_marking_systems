import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/printer.dart';
import '../models/template.dart';
import '../models/product.dart';
import '../services/api_service.dart';

class AppProvider extends ChangeNotifier {
  late ApiService _api;

  // Data
  List<Printer> _printers = [];
  List<LabelTemplate> _templates = [];

  // Selected items
  Printer? _selectedPrinter;
  LabelTemplate? _selectedTemplate;
  Product? _selectedProduct;

  // Print config
  String _lotNumber = '';
  String _packDateFormat = 'YYMMDD';
  int _packDateOffset = 0;
  final Map<String, dynamic> _customVarValues = {};
  int _quantity = 1;

  // Loading states
  bool _loadingPrinters = false;
  bool _loadingTemplates = false;

  // Error state
  String? _error;

  // Server URL
  String _serverUrl = 'http://192.168.1.100:3000';

  AppProvider() {
    _api = ApiService(baseUrl: _serverUrl);
  }

  // Getters
  List<Printer> get printers => _printers;
  List<LabelTemplate> get templates => _templates;
  Printer? get selectedPrinter => _selectedPrinter;
  LabelTemplate? get selectedTemplate => _selectedTemplate;
  Product? get selectedProduct => _selectedProduct;
  String get lotNumber => _lotNumber;
  String get packDateFormat => _packDateFormat;
  int get packDateOffset => _packDateOffset;
  Map<String, dynamic> get customVarValues => _customVarValues;
  int get quantity => _quantity;
  bool get loadingPrinters => _loadingPrinters;
  bool get loadingTemplates => _loadingTemplates;
  String? get error => _error;
  String get serverUrl => _serverUrl;

  // Initialize - load saved settings and data
  Future<void> initialize() async {
    final prefs = await SharedPreferences.getInstance();
    _serverUrl = prefs.getString('serverUrl') ?? 'http://192.168.1.100:3000';
    _api = ApiService(baseUrl: _serverUrl);
    _lotNumber = prefs.getString('lotNumber') ?? '';
    _packDateFormat = prefs.getString('packDateFormat') ?? 'YYMMDD';
    _packDateOffset = prefs.getInt('packDateOffset') ?? 0;

    await Future.wait([
      loadPrinters(),
      loadTemplates(),
    ]);
  }

  // Set server URL
  Future<void> setServerUrl(String url) async {
    _serverUrl = url;
    _api = ApiService(baseUrl: url);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('serverUrl', url);
    notifyListeners();
  }

  // Load printers
  Future<void> loadPrinters() async {
    _loadingPrinters = true;
    _error = null;
    notifyListeners();

    try {
      _printers = await _api.getPrinters();

      // Restore selected printer
      final prefs = await SharedPreferences.getInstance();
      final savedPrinterId = prefs.getString('selectedPrinterId');
      if (savedPrinterId != null && _printers.isNotEmpty) {
        try {
          _selectedPrinter = _printers.firstWhere((p) => p.id == savedPrinterId);
        } catch (_) {
          _selectedPrinter = _printers.first;
        }
      } else if (_printers.isNotEmpty) {
        _selectedPrinter = _printers.first;
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      _loadingPrinters = false;
      notifyListeners();
    }
  }

  // Load templates
  Future<void> loadTemplates() async {
    _loadingTemplates = true;
    _error = null;
    notifyListeners();

    try {
      _templates = await _api.getTemplates();

      // Restore selected template
      final prefs = await SharedPreferences.getInstance();
      final savedTemplateId = prefs.getString('selectedTemplateId');
      if (savedTemplateId != null && _templates.isNotEmpty) {
        try {
          _selectedTemplate = _templates.firstWhere((t) => t.id == savedTemplateId);
        } catch (_) {
          _selectedTemplate = _templates.first;
        }
      } else if (_templates.isNotEmpty) {
        _selectedTemplate = _templates.first;
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      _loadingTemplates = false;
      notifyListeners();
    }
  }

  // Select printer
  Future<void> selectPrinter(Printer printer) async {
    _selectedPrinter = printer;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('selectedPrinterId', printer.id);
    notifyListeners();
  }

  // Select template
  Future<void> selectTemplate(LabelTemplate template) async {
    _selectedTemplate = template;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('selectedTemplateId', template.id);
    notifyListeners();
  }

  // Select product
  void selectProduct(Product? product) {
    _selectedProduct = product;
    notifyListeners();
  }

  // Set lot number
  Future<void> setLotNumber(String value) async {
    _lotNumber = value.toUpperCase();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('lotNumber', _lotNumber);
    notifyListeners();
  }

  // Set pack date format
  Future<void> setPackDateFormat(String format) async {
    _packDateFormat = format;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('packDateFormat', format);
    notifyListeners();
  }

  // Set pack date offset
  Future<void> setPackDateOffset(int offset) async {
    _packDateOffset = offset;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('packDateOffset', offset);
    notifyListeners();
  }

  // Set custom variable value
  void setCustomVarValue(String key, dynamic value) {
    _customVarValues[key] = value;
    notifyListeners();
  }

  // Set quantity
  void setQuantity(int qty) {
    _quantity = qty.clamp(1, 100);
    notifyListeners();
  }

  // Search products
  Future<List<Product>> searchProducts(String query) async {
    if (query.length < 2) return [];
    try {
      return await _api.searchProducts(query);
    } catch (e) {
      return [];
    }
  }

  // Print label
  Future<void> printLabel(String zpl) async {
    if (_selectedPrinter == null) {
      throw Exception('No printer selected');
    }
    await _api.printLabel(_selectedPrinter!.id, zpl, copies: _quantity);
    await loadPrinters(); // Refresh printer status
  }

  // Start continuous print
  Future<void> startContinuousPrint(String zpl) async {
    if (_selectedPrinter == null) {
      throw Exception('No printer selected');
    }
    await _api.startContinuousPrint(_selectedPrinter!.id, zpl);
    await loadPrinters();
  }

  // Stop continuous print
  Future<void> stopContinuousPrint() async {
    if (_selectedPrinter == null) return;
    await _api.stopContinuousPrint(_selectedPrinter!.id);
    await loadPrinters();
  }

  // Clear error
  void clearError() {
    _error = null;
    notifyListeners();
  }

  // Can print check
  bool get canPrint =>
      _selectedPrinter != null &&
      _selectedTemplate != null &&
      _selectedPrinter!.isOnline;
}
