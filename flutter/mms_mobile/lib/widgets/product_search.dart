import 'package:flutter/material.dart';
import 'package:flutter_typeahead/flutter_typeahead.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';
import '../models/product.dart';

class ProductSearch extends StatefulWidget {
  final Product? selectedProduct;
  final Function(Product?) onProductSelected;

  const ProductSearch({
    super.key,
    this.selectedProduct,
    required this.onProductSelected,
  });

  @override
  State<ProductSearch> createState() => _ProductSearchState();
}

class _ProductSearchState extends State<ProductSearch> {
  final TextEditingController _controller = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.selectedProduct != null) {
      _controller.text = widget.selectedProduct!.description;
    }
  }

  @override
  void didUpdateWidget(ProductSearch oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.selectedProduct != oldWidget.selectedProduct) {
      _controller.text = widget.selectedProduct?.description ?? '';
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.read<AppProvider>();

    return TypeAheadField<Product>(
      controller: _controller,
      suggestionsCallback: (pattern) async {
        if (pattern.length < 2) return [];
        return await provider.searchProducts(pattern);
      },
      builder: (context, controller, focusNode) {
        return TextField(
          controller: controller,
          focusNode: focusNode,
          decoration: InputDecoration(
            hintText: 'Search by description or GTIN...',
            border: const OutlineInputBorder(),
            suffixIcon: widget.selectedProduct != null
                ? IconButton(
                    icon: const Icon(Icons.clear),
                    onPressed: () {
                      _controller.clear();
                      widget.onProductSelected(null);
                    },
                  )
                : const Icon(Icons.search),
          ),
        );
      },
      itemBuilder: (context, product) {
        return ListTile(
          title: Text(product.description),
          subtitle: Text(
            product.gtin,
            style: const TextStyle(fontFamily: 'monospace'),
          ),
          trailing: product.commodity != null
              ? Chip(
                  label: Text(product.commodity!),
                  padding: EdgeInsets.zero,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                )
              : null,
        );
      },
      onSelected: (product) {
        _controller.text = product.description;
        widget.onProductSelected(product);
      },
      emptyBuilder: (context) {
        return const Padding(
          padding: EdgeInsets.all(16),
          child: Text('No products found'),
        );
      },
      loadingBuilder: (context) {
        return const Padding(
          padding: EdgeInsets.all(16),
          child: Center(child: CircularProgressIndicator()),
        );
      },
    );
  }
}
