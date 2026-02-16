import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';
import '../models/template.dart';
import '../models/product.dart';
import '../services/zpl_generator.dart';
import '../widgets/printer_selector.dart';
import '../widgets/template_selector.dart';
import '../widgets/product_search.dart';

class ManualPrintScreen extends StatefulWidget {
  const ManualPrintScreen({super.key});

  @override
  State<ManualPrintScreen> createState() => _ManualPrintScreenState();
}

class _ManualPrintScreenState extends State<ManualPrintScreen> {
  final _lotNumberController = TextEditingController();
  bool _printing = false;
  bool _continuousMode = false;

  @override
  void initState() {
    super.initState();
    final provider = context.read<AppProvider>();
    _lotNumberController.text = provider.lotNumber;
  }

  @override
  void dispose() {
    _lotNumberController.dispose();
    super.dispose();
  }

  Future<void> _handlePrint() async {
    final provider = context.read<AppProvider>();

    if (!provider.canPrint) {
      _showError('Please select a printer and template');
      return;
    }

    setState(() => _printing = true);

    try {
      // Generate ZPL
      final zpl = ZplGenerator.generate(
        elements: provider.selectedTemplate!.elements,
        labelWidth: provider.selectedTemplate!.labelWidth,
        labelHeight: provider.selectedTemplate!.labelHeight,
        product: provider.selectedProduct,
        lotNumber: provider.lotNumber,
        packDateFormat: provider.packDateFormat,
        packDateOffset: provider.packDateOffset,
        customVarValues: provider.customVarValues,
        quantity: _continuousMode ? 1 : provider.quantity,
      );

      if (_continuousMode) {
        await provider.startContinuousPrint(zpl);
        _showSuccess('Continuous printing started');
      } else {
        await provider.printLabel(zpl);
        _showSuccess('${provider.quantity} label(s) sent to printer');
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      setState(() => _printing = false);
    }
  }

  Future<void> _handleStopContinuous() async {
    final provider = context.read<AppProvider>();
    try {
      await provider.stopContinuousPrint();
      _showSuccess('Continuous printing stopped');
    } catch (e) {
      _showError(e.toString());
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.green),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Manual Print'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              context.read<AppProvider>().loadPrinters();
              context.read<AppProvider>().loadTemplates();
            },
          ),
        ],
      ),
      body: Consumer<AppProvider>(
        builder: (context, provider, child) {
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Printer Selection
                const PrinterSelector(),
                const SizedBox(height: 16),

                // Template Selection
                const TemplateSelector(),
                const SizedBox(height: 16),

                // Product Search
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Product',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        ProductSearch(
                          selectedProduct: provider.selectedProduct,
                          onProductSelected: provider.selectProduct,
                        ),
                        if (provider.selectedProduct != null) ...[
                          const SizedBox(height: 12),
                          _ProductInfoCard(product: provider.selectedProduct!),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Print Options
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Print Options',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 16),

                        // Lot Number
                        TextField(
                          controller: _lotNumberController,
                          decoration: const InputDecoration(
                            labelText: 'Lot Number',
                            border: OutlineInputBorder(),
                          ),
                          textCapitalization: TextCapitalization.characters,
                          onChanged: provider.setLotNumber,
                        ),
                        const SizedBox(height: 16),

                        // Pack Date Format & Offset
                        Row(
                          children: [
                            Expanded(
                              flex: 2,
                              child: DropdownButtonFormField<String>(
                                value: provider.packDateFormat,
                                decoration: const InputDecoration(
                                  labelText: 'Date Format',
                                  border: OutlineInputBorder(),
                                ),
                                items: const [
                                  DropdownMenuItem(value: 'YYMMDD', child: Text('YYMMDD')),
                                  DropdownMenuItem(value: 'MMDDYY', child: Text('MMDDYY')),
                                  DropdownMenuItem(value: 'MMMDDYY', child: Text('MMMDDYY')),
                                  DropdownMenuItem(value: 'YYDDD', child: Text('YYDDD (Julian)')),
                                ],
                                onChanged: (v) => provider.setPackDateFormat(v!),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: TextField(
                                decoration: const InputDecoration(
                                  labelText: 'Offset',
                                  border: OutlineInputBorder(),
                                ),
                                keyboardType: TextInputType.number,
                                controller: TextEditingController(
                                  text: provider.packDateOffset.toString(),
                                ),
                                onChanged: (v) {
                                  final offset = int.tryParse(v) ?? 0;
                                  provider.setPackDateOffset(offset);
                                },
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Mode Toggle
                        SwitchListTile(
                          title: const Text('Continuous Mode'),
                          subtitle: const Text('Print on peel sensor trigger'),
                          value: _continuousMode,
                          onChanged: (v) => setState(() => _continuousMode = v),
                        ),

                        // Quantity (if not continuous)
                        if (!_continuousMode) ...[
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              const Text('Quantity: '),
                              IconButton(
                                icon: const Icon(Icons.remove),
                                onPressed: provider.quantity > 1
                                    ? () => provider.setQuantity(provider.quantity - 1)
                                    : null,
                              ),
                              Text(
                                '${provider.quantity}',
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              IconButton(
                                icon: const Icon(Icons.add),
                                onPressed: () => provider.setQuantity(provider.quantity + 1),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // Print Button
                if (provider.selectedPrinter?.isPrinting == true)
                  ElevatedButton.icon(
                    onPressed: _handleStopContinuous,
                    icon: const Icon(Icons.stop),
                    label: Text('Stop (${provider.selectedPrinter?.continuousPrint?.count ?? 0} printed)'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.all(16),
                    ),
                  )
                else
                  ElevatedButton.icon(
                    onPressed: provider.canPrint && !_printing ? _handlePrint : null,
                    icon: _printing
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(_continuousMode ? Icons.play_arrow : Icons.print),
                    label: Text(_continuousMode
                        ? 'Start Continuous'
                        : 'Print ${provider.quantity} Label(s)'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.all(16),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _ProductInfoCard extends StatelessWidget {
  final Product product;

  const _ProductInfoCard({required this.product});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            product.description,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'GTIN: ${product.gtin}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              fontFamily: 'monospace',
            ),
          ),
          if (product.companyName != null)
            Text(
              product.companyName!,
              style: Theme.of(context).textTheme.bodySmall,
            ),
        ],
      ),
    );
  }
}
