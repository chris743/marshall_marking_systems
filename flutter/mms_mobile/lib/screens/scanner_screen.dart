import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';
import '../services/zpl_generator.dart';
import '../widgets/printer_selector.dart';
import '../widgets/template_selector.dart';

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final MobileScannerController _scannerController = MobileScannerController();
  final _lotNumberController = TextEditingController();

  bool _isScanning = true;
  String? _lastScannedCode;
  DateTime? _lastScanTime;
  int _printCount = 0;
  List<String> _scanHistory = [];

  @override
  void initState() {
    super.initState();
    final provider = context.read<AppProvider>();
    _lotNumberController.text = provider.lotNumber;
  }

  @override
  void dispose() {
    _scannerController.dispose();
    _lotNumberController.dispose();
    super.dispose();
  }

  void _handleBarcode(BarcodeCapture capture) async {
    if (!_isScanning) return;

    final barcode = capture.barcodes.firstOrNull?.rawValue;
    if (barcode == null || barcode.isEmpty) return;

    // Debounce: ignore same code within 2 seconds
    final now = DateTime.now();
    if (_lastScannedCode == barcode &&
        _lastScanTime != null &&
        now.difference(_lastScanTime!).inSeconds < 2) {
      return;
    }

    _lastScannedCode = barcode;
    _lastScanTime = now;

    setState(() {
      _scanHistory.insert(0, '$barcode - ${TimeOfDay.now().format(context)}');
      if (_scanHistory.length > 10) _scanHistory.removeLast();
    });

    await _processScan(barcode);
  }

  Future<void> _processScan(String barcode) async {
    final provider = context.read<AppProvider>();

    if (!provider.canPrint) {
      _showError('Please select a printer and template first');
      return;
    }

    try {
      // Try to find product by GTIN
      final products = await provider.searchProducts(barcode);
      final product = products.isNotEmpty ? products.first : null;

      // Generate ZPL with scanned product (or null)
      final zpl = ZplGenerator.generate(
        elements: provider.selectedTemplate!.elements,
        labelWidth: provider.selectedTemplate!.labelWidth,
        labelHeight: provider.selectedTemplate!.labelHeight,
        product: product,
        lotNumber: provider.lotNumber,
        packDateFormat: provider.packDateFormat,
        packDateOffset: provider.packDateOffset,
        customVarValues: provider.customVarValues,
        quantity: 1,
      );

      // Print the label
      await provider.printLabel(zpl);

      setState(() => _printCount++);

      if (product != null) {
        _showSuccess('Printed: ${product.description}');
      } else {
        _showSuccess('Printed label for: $barcode');
      }
    } catch (e) {
      _showError('Print failed: $e');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green,
        duration: const Duration(seconds: 1),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scanner Mode'),
        actions: [
          IconButton(
            icon: Icon(_isScanning ? Icons.pause : Icons.play_arrow),
            onPressed: () {
              setState(() => _isScanning = !_isScanning);
              if (_isScanning) {
                _scannerController.start();
              } else {
                _scannerController.stop();
              }
            },
          ),
          IconButton(
            icon: const Icon(Icons.flash_on),
            onPressed: () => _scannerController.toggleTorch(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Scanner Preview
          Expanded(
            flex: 2,
            child: Stack(
              children: [
                MobileScanner(
                  controller: _scannerController,
                  onDetect: _handleBarcode,
                ),
                // Overlay with scan area indicator
                Center(
                  child: Container(
                    width: 280,
                    height: 150,
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: _isScanning ? Colors.green : Colors.grey,
                        width: 3,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
                // Status badge
                Positioned(
                  top: 16,
                  left: 16,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: _isScanning ? Colors.green : Colors.grey,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _isScanning ? Icons.qr_code_scanner : Icons.pause,
                          color: Colors.white,
                          size: 16,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          _isScanning ? 'Scanning' : 'Paused',
                          style: const TextStyle(color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ),
                // Print count
                Positioned(
                  top: 16,
                  right: 16,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.blue,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      'Printed: $_printCount',
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Configuration Panel
          Expanded(
            flex: 3,
            child: Consumer<AppProvider>(
              builder: (context, provider, child) {
                return SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Printer & Template Selection
                      Row(
                        children: [
                          Expanded(child: _CompactPrinterSelector(provider: provider)),
                          const SizedBox(width: 8),
                          Expanded(child: _CompactTemplateSelector(provider: provider)),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Lot Number
                      TextField(
                        controller: _lotNumberController,
                        decoration: const InputDecoration(
                          labelText: 'Lot Number',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        textCapitalization: TextCapitalization.characters,
                        onChanged: provider.setLotNumber,
                      ),
                      const SizedBox(height: 16),

                      // Scan History
                      Text(
                        'Recent Scans',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      Container(
                        height: 120,
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: _scanHistory.isEmpty
                            ? const Center(
                                child: Text('No scans yet'),
                              )
                            : ListView.builder(
                                itemCount: _scanHistory.length,
                                padding: const EdgeInsets.all(8),
                                itemBuilder: (context, index) {
                                  return Padding(
                                    padding: const EdgeInsets.symmetric(vertical: 2),
                                    child: Text(
                                      _scanHistory[index],
                                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                        fontFamily: 'monospace',
                                      ),
                                    ),
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactPrinterSelector extends StatelessWidget {
  final AppProvider provider;

  const _CompactPrinterSelector({required this.provider});

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField(
      value: provider.selectedPrinter?.id,
      decoration: const InputDecoration(
        labelText: 'Printer',
        border: OutlineInputBorder(),
        isDense: true,
      ),
      items: provider.printers.map((p) {
        return DropdownMenuItem(
          value: p.id,
          child: Row(
            children: [
              Icon(
                Icons.print,
                size: 16,
                color: p.isOnline ? Colors.green : Colors.red,
              ),
              const SizedBox(width: 8),
              Expanded(child: Text(p.name, overflow: TextOverflow.ellipsis)),
            ],
          ),
        );
      }).toList(),
      onChanged: (id) {
        final printer = provider.printers.firstWhere((p) => p.id == id);
        provider.selectPrinter(printer);
      },
    );
  }
}

class _CompactTemplateSelector extends StatelessWidget {
  final AppProvider provider;

  const _CompactTemplateSelector({required this.provider});

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField(
      value: provider.selectedTemplate?.id,
      decoration: const InputDecoration(
        labelText: 'Template',
        border: OutlineInputBorder(),
        isDense: true,
      ),
      items: provider.templates.map((t) {
        return DropdownMenuItem(
          value: t.id,
          child: Text(t.name, overflow: TextOverflow.ellipsis),
        );
      }).toList(),
      onChanged: (id) {
        final template = provider.templates.firstWhere((t) => t.id == id);
        provider.selectTemplate(template);
      },
    );
  }
}
